import { Pool, PoolClient, QueryResult } from "pg";
import { config } from "../core/config";
import { logger } from "../core/logger";
import { getCurrentRequestId } from "../core/context";

const dbLogger = logger.child({ module: "postgres" });

export function makeDual<T>(data: T): any {
  if (data === null || data === undefined) {
    return null;
  }
  if (Array.isArray(data)) {
    const arr = [...data];
    (arr as any).then = (onfulfilled: any, onrejected: any) => Promise.resolve(data).then(onfulfilled, onrejected);
    (arr as any).catch = (onrejected: any) => Promise.resolve(data).catch(onrejected);
    (arr as any).finally = (onfinally: any) => Promise.resolve(data).finally(onfinally);
    return arr;
  }
  if (typeof data === "object") {
    if (typeof (data as any).then === "function") {
      return data;
    }
    const plain = { ...data };
    const p = Promise.resolve(plain);
    return Object.assign(p, plain);
  }
  return data;
}

/**
 * In-memory PostgreSQL-compatible mock database storage for tests and offline resilience
 */
class MemoryPostgresStore {
  public tables: Map<string, any[]> = new Map();
  public serialCounters: Map<string, number> = new Map();
  private snapshotStack: Array<{ tables: Map<string, any[]>; serialCounters: Map<string, number> }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.tables.clear();
    this.serialCounters.clear();
    this.snapshotStack = [];
  }

  beginTransaction() {
    const snapTables = new Map<string, any[]>();
    for (const [k, v] of this.tables.entries()) {
      snapTables.set(k, v.map((r) => ({ ...r })));
    }
    const snapCounters = new Map<string, number>(this.serialCounters);
    this.snapshotStack.push({ tables: snapTables, serialCounters: snapCounters });
  }

  commitTransaction() {
    this.snapshotStack.pop();
  }

  rollbackTransaction() {
    const lastSnap = this.snapshotStack.pop();
    if (lastSnap) {
      this.tables = lastSnap.tables;
      this.serialCounters = lastSnap.serialCounters;
    }
  }

  getTable(name: string): any[] {
    const norm = name.toLowerCase().trim();
    if (!this.tables.has(norm)) {
      this.tables.set(norm, []);
    }
    return this.tables.get(norm)!;
  }

  nextSerial(tableName: string): number {
    const norm = tableName.toLowerCase().trim();
    const current = this.serialCounters.get(norm) || 0;
    const next = current + 1;
    this.serialCounters.set(norm, next);
    return next;
  }

  execute(sql: string, params: any[] = []): QueryResult {
    const cleanSql = sql.trim().replace(/;$/, "");
    const lines = cleanSql.split(";").map((s) => s.trim()).filter(Boolean);

    let lastResult: QueryResult = {
      command: "SELECT",
      rowCount: 0,
      rows: [],
      fields: [],
      oid: 0,
    };

    for (const statement of lines) {
      lastResult = this.executeSingle(statement, params);
    }
    return lastResult;
  }

  private executeSingle(sql: string, params: any[] = []): QueryResult {
    const s = sql.trim().replace(/\s+/g, " ");

    // 1. Transactions
    if (/^BEGIN/i.test(s)) {
      this.beginTransaction();
      return { command: "BEGIN", rowCount: 0, rows: [], fields: [], oid: 0 };
    }
    if (/^COMMIT/i.test(s)) {
      this.commitTransaction();
      return { command: "COMMIT", rowCount: 0, rows: [], fields: [], oid: 0 };
    }
    if (/^ROLLBACK/i.test(s)) {
      this.rollbackTransaction();
      return { command: "ROLLBACK", rowCount: 0, rows: [], fields: [], oid: 0 };
    }

    // 2. CREATE TABLE
    const createTableMatch = s.match(/^CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-zA-Z0-9_]+)/i);
    if (createTableMatch) {
      const tbl = createTableMatch[1].toLowerCase();
      if (!this.tables.has(tbl)) {
        this.tables.set(tbl, []);
      }
      return { command: "CREATE", rowCount: 0, rows: [], fields: [], oid: 0 };
    }

    // 3. DROP TABLE
    const dropTableMatch = s.match(/^DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+([a-zA-Z0-9_,\s]+)/i);
    if (dropTableMatch) {
      const tbls = dropTableMatch[1].split(",").map((t) => t.trim().toLowerCase());
      for (const tbl of tbls) {
        this.tables.delete(tbl);
      }
      return { command: "DROP", rowCount: 0, rows: [], fields: [], oid: 0 };
    }

    // 4. CREATE INDEX / DROP INDEX / ALTER TABLE
    if (/^(CREATE|DROP)\s+INDEX/i.test(s) || /^ALTER\s+TABLE/i.test(s)) {
      return { command: "ALTER", rowCount: 0, rows: [], fields: [], oid: 0 };
    }

    // 5. INSERT
    const insertHeaderMatch = s.match(/^INSERT\s+INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES/i);
    if (insertHeaderMatch) {
      const tableName = insertHeaderMatch[1].toLowerCase();
      const cols = insertHeaderMatch[2].split(",").map((c) => c.trim());

      const valuesIdx = s.search(/VALUES\s*\(/i);
      const startParen = s.indexOf("(", valuesIdx);
      let depth = 0;
      let endParen = -1;
      for (let i = startParen; i < s.length; i++) {
        if (s[i] === "(") depth++;
        else if (s[i] === ")") {
          depth--;
          if (depth === 0) {
            endParen = i;
            break;
          }
        }
      }

      const valuesBody = endParen !== -1 ? s.substring(startParen + 1, endParen) : "";
      const tail = endParen !== -1 ? s.substring(endParen + 1) : "";

      const rawVals: string[] = [];
      let curVal = "";
      let inParens = 0;
      let inQuote = false;
      for (let i = 0; i < valuesBody.length; i++) {
        const char = valuesBody[i];
        if (char === "'" && (i === 0 || valuesBody[i - 1] !== "\\")) {
          inQuote = !inQuote;
          curVal += char;
        } else if (char === "(" && !inQuote) {
          inParens++;
          curVal += char;
        } else if (char === ")" && !inQuote) {
          inParens--;
          curVal += char;
        } else if (char === "," && !inQuote && inParens === 0) {
          rawVals.push(curVal.trim());
          curVal = "";
        } else {
          curVal += char;
        }
      }
      if (curVal.trim()) {
        rawVals.push(curVal.trim());
      }

      const rows = this.getTable(tableName);
      const newRow: Record<string, any> = {};

      if (tableName === "mailbox") {
        newRow.id = this.nextSerial("mailbox");
      }

      cols.forEach((col, idx) => {
        const valToken = rawVals[idx] || "NULL";
        if (valToken.startsWith("$")) {
          const paramIdx = parseInt(valToken.substring(1), 10) - 1;
          newRow[col] = params[paramIdx] !== undefined ? params[paramIdx] : null;
        } else if (/^NOW\(\)|CURRENT_TIMESTAMP/i.test(valToken)) {
          newRow[col] = new Date().toISOString();
        } else if (valToken === "NULL" || valToken === "null") {
          newRow[col] = null;
        } else {
          const num = Number(valToken.replace(/['"]/g, ""));
          newRow[col] = !isNaN(num) && !valToken.includes("'") ? num : valToken.replace(/^['"]|['"]$/g, "");
        }
      });

      if (!newRow.created_at) {
        newRow.created_at = new Date().toISOString();
      }

      if (tableName === "messages" && newRow.is_deleted === undefined) {
        newRow.is_deleted = 0;
      }
      if (tableName === "mailbox" && newRow.status === undefined) {
        newRow.status = "queued";
      }
      if (tableName === "message_deliveries") {
        if (newRow.status === undefined) newRow.status = "queued";
        if (newRow.attempt_count === undefined) newRow.attempt_count = 0;
      }
      if (tableName === "refresh_tokens" && newRow.is_revoked === undefined) {
        newRow.is_revoked = 0;
      }

      const onConflictDoNothing = /ON\s+CONFLICT.*DO\s+NOTHING/i.test(tail);
      const onConflictUpdate = /ON\s+CONFLICT\s*\(([^)]+)\)\s*DO\s+UPDATE\s+SET\s+([\s\S]+)/i.exec(tail);

      let conflictIdx = -1;
      if (tableName === "users") {
        conflictIdx = rows.findIndex((r) => r.id === newRow.id || r.username === newRow.username || r.email === newRow.email);
      } else if (tableName === "rooms") {
        conflictIdx = rows.findIndex((r) => r.id === newRow.id);
      } else if (tableName === "schema_migrations") {
        conflictIdx = rows.findIndex((r) => r.version === newRow.version);
      } else if (tableName === "user_devices") {
        conflictIdx = rows.findIndex((r) => r.user_id === newRow.user_id && r.device_id === newRow.device_id);
      } else if (tableName === "signed_prekeys" || tableName === "one_time_prekeys") {
        conflictIdx = rows.findIndex((r) => r.user_id === newRow.user_id && r.device_id === newRow.device_id && r.key_id === newRow.key_id);
      } else if (tableName === "message_deliveries") {
        conflictIdx = rows.findIndex((r) => r.message_id === newRow.message_id);
      } else if (tableName === "mailbox") {
        conflictIdx = rows.findIndex((r) => r.message_id === newRow.message_id);
      } else if (tableName === "refresh_tokens") {
        conflictIdx = rows.findIndex((r) => r.token_hash === newRow.token_hash);
      }

      let returnedRow = newRow;

      if (conflictIdx >= 0) {
        if (onConflictDoNothing) {
          returnedRow = rows[conflictIdx];
        } else if (onConflictUpdate) {
          const existing = rows[conflictIdx];
          Object.assign(existing, newRow);
          returnedRow = existing;
        } else {
          rows[conflictIdx] = newRow;
        }
      } else {
        rows.push(newRow);
      }

      const returningMatch = tail.match(/RETURNING\s+([\s\S]+)/i);
      const retRows: any[] = [];
      if (returningMatch) {
        const retCols = returningMatch[1].trim();
        if (retCols === "*") {
          retRows.push({ ...returnedRow });
        } else {
          const obj: any = {};
          retCols.split(",").map((c) => c.trim()).forEach((c) => {
            obj[c] = returnedRow[c];
          });
          retRows.push(obj);
        }
      }

      return {
        command: "INSERT",
        rowCount: 1,
        rows: retRows,
        fields: [],
        oid: 0,
      };
    }

    // 6. UPDATE
    const updateMatch = s.match(/^UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+([\s\S]+?)(?:\s+WHERE\s+([\s\S]+?))?(?:\s+RETURNING\s+([\s\S]+))?$/i);
    if (updateMatch) {
      const tableName = updateMatch[1].toLowerCase();
      const setClause = updateMatch[2];
      const whereClause = updateMatch[3];
      const returningClause = updateMatch[4];

      const rows = this.getTable(tableName);
      let updatedCount = 0;
      const returnedRows: any[] = [];

      for (const row of rows) {
        if (this.evalWhere(whereClause, row, params)) {
          this.applySet(setClause, row, params);
          updatedCount++;
          if (returningClause) {
            if (returningClause.trim() === "*") {
              returnedRows.push({ ...row });
            } else {
              const obj: any = {};
              returningClause.split(",").map((c) => c.trim()).forEach((c) => {
                obj[c] = row[c];
              });
              returnedRows.push(obj);
            }
          }
        }
      }

      return {
        command: "UPDATE",
        rowCount: updatedCount,
        rows: returnedRows,
        fields: [],
        oid: 0,
      };
    }

    // 7. DELETE
    const deleteMatch = s.match(/^DELETE\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+([\s\S]+?))?(?:\s+RETURNING\s+([\s\S]+))?$/i);
    if (deleteMatch) {
      const tableName = deleteMatch[1].toLowerCase();
      const whereClause = deleteMatch[2];
      const returningClause = deleteMatch[3];

      const rows = this.getTable(tableName);
      const remaining: any[] = [];
      const returnedRows: any[] = [];
      let deletedCount = 0;

      for (const row of rows) {
        if (this.evalWhere(whereClause, row, params)) {
          deletedCount++;
          if (returningClause) {
            if (returningClause.trim() === "*") {
              returnedRows.push({ ...row });
            } else {
              const obj: any = {};
              returningClause.split(",").map((c) => c.trim()).forEach((c) => {
                obj[c] = row[c];
              });
              returnedRows.push(obj);
            }
          }
        } else {
          remaining.push(row);
        }
      }

      this.tables.set(tableName, remaining);
      return {
        command: "DELETE",
        rowCount: deletedCount,
        rows: returnedRows,
        fields: [],
        oid: 0,
      };
    }

    // 8. SELECT
    const selectMatch = s.match(
      /^SELECT\s+([\s\S]+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_]+))?(?:\s+INNER\s+JOIN\s+([a-zA-Z0-9_]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_]+))?\s+ON\s+([\s\S]+?))?(?:\s+WHERE\s+([\s\S]+?))?(?:\s+ORDER\s+BY\s+([\s\S]+?))?(?:\s+LIMIT\s+(\d+|\$\d+))?(?:\s+FOR\s+UPDATE.*)?$/i
    );
    if (selectMatch) {
      const selectCols = selectMatch[1].trim();
      const primaryTable = selectMatch[2].toLowerCase();
      const joinTable = selectMatch[4] ? selectMatch[4].toLowerCase() : null;
      const whereClause = selectMatch[7];
      const orderByClause = selectMatch[8];
      const limitStr = selectMatch[9];

      let rows = [...this.getTable(primaryTable)];

      if (joinTable) {
        const joinRows = this.getTable(joinTable);
        const merged: any[] = [];
        for (const pr of rows) {
          const match = joinRows.find((jr) => jr.message_id === pr.message_id);
          if (match) {
            merged.push({ ...pr, ...match, id: pr.id });
          }
        }
        rows = merged;
      }

      if (whereClause) {
        rows = rows.filter((r) => this.evalWhere(whereClause, r, params));
      }

      if (orderByClause) {
        const parts = orderByClause.split(",").map((p) => p.trim());
        for (const p of parts) {
          const [colWithTbl, dir] = p.split(/\s+/);
          const col = colWithTbl.includes(".") ? colWithTbl.split(".")[1] : colWithTbl;
          const isDesc = /^DESC/i.test(dir);
          rows.sort((a, b) => {
            if (a[col] < b[col]) return isDesc ? 1 : -1;
            if (a[col] > b[col]) return isDesc ? -1 : 1;
            return 0;
          });
        }
      }

      if (limitStr) {
        let limitNum = parseInt(limitStr, 10);
        if (limitStr.startsWith("$")) {
          const pIdx = parseInt(limitStr.substring(1), 10) - 1;
          limitNum = params[pIdx];
        }
        if (!isNaN(limitNum) && limitNum >= 0) {
          rows = rows.slice(0, limitNum);
        }
      }

      if (selectCols === "*") {
        return { command: "SELECT", rowCount: rows.length, rows, fields: [], oid: 0 };
      }

      if (/^COUNT\s*\(\s*\*\s*\)(?:\s+as\s+(\w+))?/i.test(selectCols)) {
        const aliasMatch = selectCols.match(/^COUNT\s*\(\s*\*\s*\)(?:\s+as\s+(\w+))?/i);
        const alias = aliasMatch?.[1] || "count";
        return {
          command: "SELECT",
          rowCount: 1,
          rows: [{ [alias]: String(rows.length), cnt: String(rows.length), count: String(rows.length) }],
          fields: [],
          oid: 0,
        };
      }

      const cols = this.splitOutsideParens(selectCols, /^,/).map((c) => c.trim());
      const projected = rows.map((r) => {
        const item: any = {};
        for (const rawCol of cols) {
          let alias = rawCol;
          let colName = rawCol;
          if (/\s+AS\s+/i.test(rawCol)) {
            const [cName, aName] = rawCol.split(/\s+AS\s+/i);
            colName = cName.trim();
            alias = aName.trim();
          } else {
            if (alias.includes(".")) {
              alias = alias.split(".")[1].trim();
            }
          }
          if (colName.includes(".")) {
            colName = colName.split(".")[1].trim();
          }
          if (/^COALESCE\(([^,]+),\s*([^)]+)\)/i.test(colName)) {
            const cMatch = colName.match(/^COALESCE\(([^,]+),\s*([^)]+)\)/i)!;
            const field = cMatch[1].includes(".") ? cMatch[1].split(".")[1] : cMatch[1];
            item[alias] = r[field] !== null && r[field] !== undefined ? r[field] : Number(cMatch[2]) || cMatch[2];
          } else {
            item[alias] = r[colName] !== undefined ? r[colName] : null;
          }
        }
        return item;
      });

      return { command: "SELECT", rowCount: projected.length, rows: projected, fields: [], oid: 0 };
    }

    if (/^SELECT\s+1/i.test(s)) {
      return { command: "SELECT", rowCount: 1, rows: [{ health_check: 1, "?column?": 1 }], fields: [], oid: 0 };
    }

    return { command: "SELECT", rowCount: 0, rows: [], fields: [], oid: 0 };
  }

  private stripOuterParens(str: string): string {
    let s = str.trim();
    if (s.startsWith("(") && s.endsWith(")")) {
      let depth = 0;
      let wrapsEntireString = true;
      for (let i = 0; i < s.length; i++) {
        if (s[i] === "(") {
          depth++;
        } else if (s[i] === ")") {
          depth--;
          if (depth === 0 && i < s.length - 1) {
            wrapsEntireString = false;
            break;
          }
        }
      }
      if (wrapsEntireString && depth === 0) {
        return this.stripOuterParens(s.substring(1, s.length - 1));
      }
    }
    return s;
  }

  private splitOutsideParens(str: string, delimiterRegex: RegExp): string[] {
    const parts: string[] = [];
    let cur = "";
    let inParens = 0;
    let inQuote = false;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (char === "'" && (i === 0 || str[i - 1] !== "\\")) {
        inQuote = !inQuote;
        cur += char;
      } else if (char === "(" && !inQuote) {
        inParens++;
        cur += char;
      } else if (char === ")" && !inQuote) {
        inParens--;
        cur += char;
      } else if (!inQuote && inParens === 0) {
        const remaining = str.substring(i);
        const match = remaining.match(delimiterRegex);
        if (match && match.index === 0) {
          parts.push(cur.trim());
          cur = "";
          i += match[0].length - 1;
          continue;
        }
        cur += char;
      } else {
        cur += char;
      }
    }

    if (cur.trim()) {
      parts.push(cur.trim());
    }

    return parts;
  }

  private evalWhere(where: string | undefined, row: Record<string, any>, params: any[]): boolean {
    if (!where || where.trim() === "") return true;

    const cleaned = this.stripOuterParens(where);

    const orParts = this.splitOutsideParens(cleaned, /^\s+OR\s+/i);
    if (orParts.length > 1) {
      return orParts.some((part) => this.evalWhere(part, row, params));
    }

    const andParts = this.splitOutsideParens(cleaned, /^\s+AND\s+/i);
    if (andParts.length > 1) {
      return andParts.every((part) => this.evalWhere(part, row, params));
    }

    return this.evalSinglePredicate(cleaned, row, params);
  }

  private evalSinglePredicate(pred: string, row: Record<string, any>, params: any[]): boolean {
    const p = pred.trim();

    const anyMatch = p.match(/^([a-zA-Z0-9_.]+)\s*=\s*ANY\s*\(([^)]+)\)$/i);
    if (anyMatch) {
      let col = anyMatch[1];
      if (col.includes(".")) col = col.split(".")[1];
      const paramToken = anyMatch[2].split("::")[0].trim();
      let arr: any[] = [];
      if (paramToken.startsWith("$")) {
        const idx = parseInt(paramToken.substring(1), 10) - 1;
        arr = Array.isArray(params[idx]) ? params[idx] : [params[idx]];
      }
      return arr.includes(row[col]);
    }

    const eqMatch = p.match(/^([a-zA-Z0-9_.() ,]+?)\s*(<=|>=|!=|<>|=|<|>)\s*([\s\S]+)$/i);
    if (eqMatch) {
      let col = eqMatch[1].trim();
      let rowVal: any = undefined;

      if (/^COALESCE\(/i.test(col)) {
        const cMatch = col.match(/^COALESCE\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/i);
        if (cMatch) {
          const field = cMatch[1].includes(".") ? cMatch[1].split(".")[1].trim() : cMatch[1].trim();
          const fallback = cMatch[2].trim();
          let val = row[field];
          if (val === null || val === undefined) {
            const num = Number(fallback.replace(/['"]/g, ""));
            val = !isNaN(num) ? num : fallback.replace(/^['"]|['"]$/g, "");
          }
          rowVal = val;
        }
      } else {
        if (col.includes(".")) col = col.split(".")[1].trim();
        rowVal = row[col];
      }

      const op = eqMatch[2];
      let rightValStr = eqMatch[3].trim();

      let targetVal: any = rightValStr;
      if (rightValStr.startsWith("$")) {
        const idx = parseInt(rightValStr.substring(1), 10) - 1;
        targetVal = params[idx];
      } else if (/^NOW\(\)|CURRENT_TIMESTAMP/i.test(rightValStr)) {
        targetVal = new Date().toISOString();
      } else if (rightValStr === "NULL" || rightValStr === "null") {
        targetVal = null;
      } else {
        const num = Number(rightValStr.replace(/['"]/g, ""));
        targetVal = !isNaN(num) && !rightValStr.includes("'") ? num : rightValStr.replace(/^['"]|['"]$/g, "");
      }

      if (op === "=") return rowVal == targetVal;
      if (op === "!=" || op === "<>") return rowVal != targetVal;
      if (op === "<") return Number(rowVal) < Number(targetVal) || (typeof rowVal === "string" && rowVal < targetVal);
      if (op === ">") return Number(rowVal) > Number(targetVal) || (typeof rowVal === "string" && rowVal > targetVal);
      if (op === "<=") return Number(rowVal) <= Number(targetVal) || (typeof rowVal === "string" && rowVal <= targetVal);
      if (op === ">=") return Number(rowVal) >= Number(targetVal) || (typeof rowVal === "string" && rowVal >= targetVal);
    }

    const notInMatch = p.match(/^([a-zA-Z0-9_.]+)\s+NOT\s+IN\s*\(([^)]+)\)$/i);
    if (notInMatch) {
      let col = notInMatch[1];
      if (col.includes(".")) col = col.split(".")[1];
      const allowed = notInMatch[2].split(",").map((v) => v.trim().replace(/^['"]|['"]$/g, ""));
      return !allowed.includes(String(row[col]));
    }

    const inMatch = p.match(/^([a-zA-Z0-9_.]+)\s+IN\s*\(([^)]+)\)$/i);
    if (inMatch) {
      let col = inMatch[1];
      if (col.includes(".")) col = col.split(".")[1];
      const allowed = inMatch[2].split(",").map((v) => v.trim().replace(/^['"]|['"]$/g, ""));
      return allowed.includes(String(row[col]));
    }

    const isNullMatch = p.match(/^([a-zA-Z0-9_.]+)\s+IS\s+NULL$/i);
    if (isNullMatch) {
      let col = isNullMatch[1];
      if (col.includes(".")) col = col.split(".")[1];
      return row[col] === null || row[col] === undefined;
    }

    const isNotNullMatch = p.match(/^([a-zA-Z0-9_.]+)\s+IS\s+NOT\s+NULL$/i);
    if (isNotNullMatch) {
      let col = isNotNullMatch[1];
      if (col.includes(".")) col = col.split(".")[1];
      return row[col] !== null && row[col] !== undefined;
    }

    return true;
  }

  private parseAssignments(setClause: string): Array<{ col: string; valRaw: string }> {
    const assignments: Array<{ col: string; valRaw: string }> = [];
    let cur = "";
    let inParens = 0;
    let inQuote = false;

    for (let i = 0; i < setClause.length; i++) {
      const char = setClause[i];
      if (char === "'" && (i === 0 || setClause[i - 1] !== "\\")) {
        inQuote = !inQuote;
        cur += char;
      } else if (char === "(" && !inQuote) {
        inParens++;
        cur += char;
      } else if (char === ")" && !inQuote) {
        inParens--;
        cur += char;
      } else if (char === "," && !inQuote && inParens === 0) {
        const eqIdx = cur.indexOf("=");
        if (eqIdx !== -1) {
          assignments.push({
            col: cur.substring(0, eqIdx).trim(),
            valRaw: cur.substring(eqIdx + 1).trim(),
          });
        }
        cur = "";
      } else {
        cur += char;
      }
    }

    if (cur.trim()) {
      const eqIdx = cur.indexOf("=");
      if (eqIdx !== -1) {
        assignments.push({
          col: cur.substring(0, eqIdx).trim(),
          valRaw: cur.substring(eqIdx + 1).trim(),
        });
      }
    }

    return assignments;
  }

  private applySet(setClause: string, row: Record<string, any>, params: any[]) {
    const assignments = this.parseAssignments(setClause);
    for (const { col: colRaw, valRaw } of assignments) {
      const col = colRaw.includes(".") ? colRaw.split(".")[1] : colRaw;

      if (!valRaw) continue;

      if (valRaw.startsWith("$")) {
        const idx = parseInt(valRaw.substring(1), 10) - 1;
        row[col] = params[idx] !== undefined ? params[idx] : null;
      } else if (/^NOW\(\)|CURRENT_TIMESTAMP/i.test(valRaw)) {
        row[col] = new Date().toISOString();
      } else if (valRaw === "NULL" || valRaw === "null") {
        row[col] = null;
      } else if (/^COALESCE\(/i.test(valRaw)) {
        const match = valRaw.match(/^COALESCE\(\s*([^,]+)\s*,\s*([^)]+)\s*\)(?:\s*([+\-*/])\s*(\d+))?/i);
        if (match) {
          let param1 = match[1].trim();
          let param2 = match[2].trim();
          let baseVal: any = null;

          if (param1.startsWith("$")) {
            const idx = parseInt(param1.substring(1), 10) - 1;
            baseVal = params[idx];
          } else {
            baseVal = row[param1];
          }

          if (baseVal === null || baseVal === undefined) {
            if (param2.startsWith("$")) {
              const idx = parseInt(param2.substring(1), 10) - 1;
              baseVal = params[idx];
            } else if (row[param2] !== undefined) {
              baseVal = row[param2];
            } else {
              const num = Number(param2.replace(/['"]/g, ""));
              baseVal = !isNaN(num) ? num : param2.replace(/^['"]|['"]$/g, "");
            }
          }

          if (match[3] === "+") baseVal = Number(baseVal || 0) + Number(match[4]);
          if (match[3] === "-") baseVal = Number(baseVal || 0) - Number(match[4]);

          row[col] = baseVal;
        }
      } else {
        const num = Number(valRaw.replace(/['"]/g, ""));
        row[col] = !isNaN(num) && !valRaw.includes("'") ? num : valRaw.replace(/^['"]|['"]$/g, "");
      }
    }
  }
}

export const memoryStore = new MemoryPostgresStore();

/**
 * Extracts a safe query descriptor from SQL
 */
export function extractQueryName(sql: string): string {
  if (!sql) return "SQL";
  const cleaned = sql.trim().replace(/\s+/g, " ");

  const selectCountMatch = cleaned.match(/^SELECT\s+COUNT\s*\([^)]*\)\s+(?:as\s+\w+\s+)?FROM\s+([a-zA-Z0-9_]+)/i);
  if (selectCountMatch) return `SELECT COUNT ${selectCountMatch[1]}`;

  const selectMatch = cleaned.match(/^SELECT\s+[\s\S]+?\s+FROM\s+([a-zA-Z0-9_]+)/i);
  if (selectMatch) return `SELECT ${selectMatch[1]}`;

  const insertMatch = cleaned.match(/^INSERT\s+INTO\s+([a-zA-Z0-9_]+)/i);
  if (insertMatch) return `INSERT ${insertMatch[1]}`;

  const updateMatch = cleaned.match(/^UPDATE\s+([a-zA-Z0-9_]+)/i);
  if (updateMatch) return `UPDATE ${updateMatch[1]}`;

  const deleteMatch = cleaned.match(/^DELETE\s+FROM\s+([a-zA-Z0-9_]+)/i);
  if (deleteMatch) return `DELETE ${deleteMatch[1]}`;

  const createTableMatch = cleaned.match(/^CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-zA-Z0-9_]+)/i);
  if (createTableMatch) return `CREATE TABLE ${createTableMatch[1]}`;

  return cleaned.split(" ").slice(0, 3).join(" ").toUpperCase();
}

function logQueryExecution(params: {
  queryName: string;
  durationMs: number;
  rowCount?: number;
  err?: any;
}) {
  const requestId = getCurrentRequestId();
  const isSchedulerPoll = !requestId && (params.queryName.toLowerCase().includes("mailbox") || params.queryName.toLowerCase().includes("message_deliveries"));
  const isEmptyPoll = isSchedulerPoll && params.rowCount === 0;

  // Do not log empty mailbox sweeps (Phase 13D.1)
  if (isEmptyPoll && !params.err) {
    dbLogger.debug(
      { queryName: params.queryName, durationMs: params.durationMs, rowCount: 0 },
      `Mailbox scheduler idle poll`
    );
    return;
  }

  const isSlow = params.durationMs >= 100;
  const logPayload = {
    queryName: params.queryName,
    durationMs: params.durationMs,
    rowCount: params.rowCount,
    requestId: requestId || undefined,
    slow: isSlow,
  };

  if (params.err) {
    dbLogger.error(
      { ...logPayload, err: params.err, stack: params.err?.stack },
      `❌ DB Query Failed: ${params.queryName} (${params.durationMs}ms)`
    );
  } else if (isSlow && !isSchedulerPoll) {
    dbLogger.warn(
      logPayload,
      `⚠️ Slow DB Query (>100ms): ${params.queryName} (${params.durationMs}ms)`
    );
  } else {
    dbLogger.info(
      logPayload,
      `DB ${params.queryName} ${params.durationMs}ms`
    );
  }
}

function getSslConfig(databaseUrl: string) {
  const urlLower = databaseUrl.toLowerCase();
  const isCloudHost = urlLower.includes("neon.tech") || urlLower.includes("amazonaws.com") || urlLower.includes("rds");
  const hasSslMode = urlLower.includes("sslmode=require") || urlLower.includes("ssl=true");

  if (isCloudHost || hasSslMode || config.isProduction) {
    return { rejectUnauthorized: false };
  }
  return false;
}

const connectionString = config.database.url || process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/hichat";

const connectionTimeoutMillis =
  config.database?.connectionTimeoutMillis && config.database.connectionTimeoutMillis >= 10000
    ? config.database.connectionTimeoutMillis
    : 10000;

export function createPool(): Pool {
  const p = new Pool({
    connectionString,
    ssl: getSslConfig(connectionString),
    max: config.database?.maxConnections || 20,
    idleTimeoutMillis: config.database?.idleTimeoutMillis || 30000,
    connectionTimeoutMillis,
  });
  p.on("error", (err) => {
    dbLogger.error({ err }, "Unexpected error on idle PostgreSQL client");
  });
  return p;
}

export let pool = createPool();

let isPgAvailable: boolean | null = null;

export function isPostgresConnected(): boolean {
  return isPgAvailable === true;
}

export async function checkPgConnection(): Promise<boolean> {
  if (isPgAvailable !== null) return isPgAvailable;
  try {
    const client = await pool.connect();
    client.release();
    isPgAvailable = true;
    return true;
  } catch (_) {
    isPgAvailable = false;
    return false;
  }
}

/**
 * Execute a PostgreSQL query with performance tracking and structured logging
 */
export async function query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
  const start = performance.now();
  const queryName = extractQueryName(text);

  if (isPgAvailable === false) {
    const res = memoryStore.execute(text, params) as QueryResult<T>;
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    logQueryExecution({ queryName, durationMs, rowCount: res.rowCount ?? undefined });
    return res;
  }

  try {
    if ((pool as any).ending || (pool as any).ended) {
      pool = createPool();
    }
    const res = await pool.query<T>(text, params);
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    logQueryExecution({ queryName, durationMs, rowCount: res.rowCount ?? undefined });
    return res;
  } catch (err: any) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    logQueryExecution({ queryName, durationMs, err });
    throw err;
  }
}

/**
 * Execute a transaction block (BEGIN -> callback -> COMMIT / ROLLBACK)
 */
export async function transaction<T>(callback: (client: any) => Promise<T> | T): Promise<T> {
  const txId = `tx_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const requestId = getCurrentRequestId();

  dbLogger.info({ txId, requestId, action: "begin" }, `🔄 PostgreSQL Transaction BEGIN (${txId})`);
  const start = performance.now();

  if (isPgAvailable !== false) {
    if ((pool as any).ending || (pool as any).ended) {
      pool = createPool();
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN;");
      const result = await callback(client);
      await client.query("COMMIT;");
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      dbLogger.info({ txId, requestId, action: "commit", durationMs }, `✅ PostgreSQL Transaction COMMIT (${txId} - ${durationMs}ms)`);
      return result;
    } catch (err: any) {
      try {
        await client.query("ROLLBACK;");
      } catch (_) {}
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      dbLogger.error({ txId, requestId, action: "rollback", durationMs, err }, `❌ PostgreSQL Transaction ROLLBACK (${txId} - ${durationMs}ms)`);
      throw err;
    } finally {
      client.release();
    }
  }

  // Synchronous in-memory transaction with rollback support
  memoryStore.beginTransaction();
  const mockClient = {
    query: async (qText: string, qParams?: any[]): Promise<QueryResult> => {
      const qRes = memoryStore.execute(qText, qParams);
      return qRes;
    },
  };

  try {
    const result = await callback(mockClient);
    memoryStore.commitTransaction();
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    dbLogger.info({ txId, requestId, action: "commit", durationMs }, `✅ PostgreSQL Transaction COMMIT (${txId} - ${durationMs}ms)`);
    return result;
  } catch (err: any) {
    memoryStore.rollbackTransaction();
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    dbLogger.error({ txId, requestId, action: "rollback", durationMs, err }, `❌ PostgreSQL Transaction ROLLBACK (${txId} - ${durationMs}ms)`);
    throw err;
  }
}

export async function connect(): Promise<PoolClient | null> {
  try {
    if ((pool as any).ending || (pool as any).ended) {
      pool = createPool();
    }
    const client = await pool.connect();
    isPgAvailable = true;
    dbLogger.info("🐘 Connected to PostgreSQL database pool successfully!");
    client.release();
    return client;
  } catch (err: any) {
    isPgAvailable = false;
    dbLogger.error({ err: err?.message || err }, "❌ Failed to connect to PostgreSQL database pool");
    if (config.database.driver === "sqlite") {
      dbLogger.warn("⚠️ Running with SQLite fallback (DB_DRIVER=sqlite)");
      return null;
    }
    throw err;
  }
}

export async function disconnect(): Promise<void> {
  try {
    await pool.end();
    dbLogger.info("🛑 PostgreSQL pool closed gracefully.");
  } catch (err: any) {
    dbLogger.error({ err }, "Error closing PostgreSQL pool");
  }
}

export async function healthCheck(): Promise<{
  healthy: boolean;
  driver: string;
  latencyMs?: number;
  pool?: {
    total: number;
    idle: number;
    waiting: number;
  };
  totalCount?: number;
  idleCount?: number;
  waitingCount?: number;
  error?: string;
}> {
  const start = performance.now();
  try {
    await query("SELECT 1 as health_check;");
    const latencyMs = Math.round((performance.now() - start) * 100) / 100;
    return {
      healthy: true,
      driver: "postgres",
      latencyMs,
      pool: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    };
  } catch (err: any) {
    return {
      healthy: false,
      driver: "postgres",
      error: err.message,
    };
  }
}
