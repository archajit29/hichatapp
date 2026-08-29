import { query, transaction } from "../db/postgres";
import { UserDevice, SignedPreKey, OneTimePreKey } from "./types";

export interface SignalKeyBundleUpload {
  userId: string;
  deviceId?: number;
  registrationId: number;
  identityKey: string;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  oneTimePreKeys?: Array<{
    keyId: number;
    publicKey: string;
  }>;
}

export interface FetchedPreKeyBundle {
  identityKey: string;
  registrationId: number;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  oneTimePreKey: {
    keyId: number;
    publicKey: string;
  } | null;
}

export class SignalKeyRepository {
  async saveKeyBundle(data: SignalKeyBundleUpload): Promise<{ remainingOneTimePreKeys: number }> {
    const deviceId = data.deviceId || 1;

    return await transaction(async (client) => {
      const deviceUuid = `dev_${data.userId}_${deviceId}`;
      await client.query(
        `INSERT INTO user_devices (id, user_id, device_id, registration_id, identity_key, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id, device_id) DO UPDATE SET
           registration_id = EXCLUDED.registration_id,
           identity_key = EXCLUDED.identity_key,
           updated_at = NOW()`,
        [deviceUuid, data.userId, deviceId, data.registrationId, data.identityKey]
      );

      const spkUuid = `spk_${data.userId}_${deviceId}_${data.signedPreKey.keyId}`;
      await client.query(
        `INSERT INTO signed_prekeys (id, user_id, device_id, key_id, public_key, signature)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, device_id, key_id) DO UPDATE SET
           public_key = EXCLUDED.public_key,
           signature = EXCLUDED.signature`,
        [
          spkUuid,
          data.userId,
          deviceId,
          data.signedPreKey.keyId,
          data.signedPreKey.publicKey,
          data.signedPreKey.signature,
        ]
      );

      if (data.oneTimePreKeys && Array.isArray(data.oneTimePreKeys)) {
        for (const opk of data.oneTimePreKeys) {
          const opkUuid = `opk_${data.userId}_${deviceId}_${opk.keyId}`;
          await client.query(
            `INSERT INTO one_time_prekeys (id, user_id, device_id, key_id, public_key)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, device_id, key_id) DO UPDATE SET
               public_key = EXCLUDED.public_key`,
            [opkUuid, data.userId, deviceId, opk.keyId, opk.publicKey]
          );
        }
      }

      await client.query("UPDATE users SET public_key = $1 WHERE id = $2", [data.identityKey, data.userId]);

      const countRes = await client.query(
        "SELECT COUNT(*) as count FROM one_time_prekeys WHERE user_id = $1 AND device_id = $2",
        [data.userId, deviceId]
      );

      return { remainingOneTimePreKeys: Number(countRes.rows[0]?.count || 0) };
    });
  }

  async addOneTimePreKeys(
    userId: string,
    deviceId = 1,
    oneTimePreKeys: Array<{ keyId: number; publicKey: string }>
  ): Promise<{ count: number; remainingOneTimePreKeys: number }> {
    return await transaction(async (client) => {
      for (const opk of oneTimePreKeys) {
        const opkUuid = `opk_${userId}_${deviceId}_${opk.keyId}`;
        await client.query(
          `INSERT INTO one_time_prekeys (id, user_id, device_id, key_id, public_key)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, device_id, key_id) DO UPDATE SET
             public_key = EXCLUDED.public_key`,
          [opkUuid, userId, deviceId, opk.keyId, opk.publicKey]
        );
      }

      const countRes = await client.query(
        "SELECT COUNT(*) as count FROM one_time_prekeys WHERE user_id = $1 AND device_id = $2",
        [userId, deviceId]
      );

      return { count: oneTimePreKeys.length, remainingOneTimePreKeys: Number(countRes.rows[0]?.count || 0) };
    });
  }

  async fetchAndConsumePreKeyBundle(userId: string, deviceId = 1): Promise<FetchedPreKeyBundle | null> {
    return await transaction(async (client) => {
      const devRes = await client.query(
        `SELECT registration_id, identity_key
         FROM user_devices
         WHERE user_id = $1 AND device_id = $2`,
        [userId, deviceId]
      );

      const device = devRes.rows[0];
      if (!device) return null;

      const spkRes = await client.query(
        `SELECT key_id, public_key, signature
         FROM signed_prekeys
         WHERE user_id = $1 AND device_id = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, deviceId]
      );

      const signedPreKey = spkRes.rows[0];
      if (!signedPreKey) return null;

      const opkSelect = await client.query(
        `SELECT id, key_id, public_key
         FROM one_time_prekeys
         WHERE user_id = $1 AND device_id = $2
         ORDER BY key_id ASC
         LIMIT 1`,
        [userId, deviceId]
      );

      const oneTimePreKey = opkSelect.rows[0] || null;
      if (oneTimePreKey) {
        await client.query("DELETE FROM one_time_prekeys WHERE id = $1", [oneTimePreKey.id]);
      }

      return {
        identityKey: device.identity_key,
        registrationId: device.registration_id,
        signedPreKey: {
          keyId: Number(signedPreKey.key_id),
          publicKey: signedPreKey.public_key,
          signature: signedPreKey.signature,
        },
        oneTimePreKey: oneTimePreKey
          ? {
              keyId: Number(oneTimePreKey.key_id),
              publicKey: oneTimePreKey.public_key,
            }
          : null,
      };
    });
  }

  async countOneTimePreKeys(userId: string, deviceId = 1): Promise<number> {
    const res = await query<{ count: string | number }>(
      `SELECT COUNT(*) as count
       FROM one_time_prekeys
       WHERE user_id = $1 AND device_id = $2`,
      [userId, deviceId]
    );

    return Number(res.rows[0]?.count || 0);
  }

  async hasBundle(userId: string, deviceId = 1): Promise<boolean> {
    const res = await query(
      "SELECT 1 FROM user_devices WHERE user_id = $1 AND device_id = $2",
      [userId, deviceId]
    );
    return res.rowCount !== null && res.rowCount > 0;
  }
}

export const signalKeyRepository = new SignalKeyRepository();
