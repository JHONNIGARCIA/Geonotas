import mysql from 'mysql2/promise';

export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // TiDB Cloud / MySQL Connection
  const host = process.env.DB_HOST ? process.env.DB_HOST.trim() : 'localhost';
  const user = process.env.DB_USER ? process.env.DB_USER.trim() : 'root';
  const pass = process.env.DB_PASS ? process.env.DB_PASS.trim() : '';
  const name = process.env.DB_NAME ? process.env.DB_NAME.trim() : 'geonotes_db';
  const port = process.env.DB_PORT ? process.env.DB_PORT.trim() : '4000';
  
  const encodedUser = encodeURIComponent(user);
  const encodedPass = encodeURIComponent(pass);

  const dbConfig = `mysql://${encodedUser}:${encodedPass}@${host}:${port}/${name}?ssl={"rejectUnauthorized":true}`;

  
  let connection;
  try {
    if (host === 'localhost') {
       connection = await mysql.createConnection({ host, user, password: pass, database: name, port });
    } else {
       connection = await mysql.createConnection(dbConfig);
    }
  } catch (err) {
    const attemptedVars = { host, user, port, hasPass: !!pass, configStr: dbConfig.replace(encodedPass, '***') };
    console.error("CRITICAL DB CONNECTION ERROR:", err, "ATTEMPTED:", attemptedVars);
    return res.status(500).json({ status: 'error', message: 'Fallo de BD por prefix URI', vars: attemptedVars, debug: err.message });
  }

  const sendError = (message, details) => {
    connection.end();
    return res.status(500).json({ status: 'error', message, details: details?.message || details });
  };
  const sendSuccess = (data) => {
    connection.end();
    return res.status(200).json(data);
  };

  const action = req.query.action || (req.body && req.body.action) || '';

  try {
    if (action === 'save') {
      const dataSrc = req.method === 'POST' ? req.body : req.query;
      const { lat, lng, type, text, image, visibilidad } = dataSrc;
      const finalVisibilidad = visibilidad || 'publico';
      let shareCode = null;

      if (finalVisibilidad === 'privado') {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        shareCode = 'GN-';
        for (let i = 0; i < 4; i++) {
          shareCode += chars.charAt(Math.floor(Math.random() * chars.length));
        }
      }

      await connection.execute(
        'INSERT INTO notas (lat, lng, type, text, image, visibilidad, share_code) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [lat, lng, type, text, image || null, finalVisibilidad, shareCode]
      );

      return sendSuccess({ status: 'ok', share_code: shareCode });

    } else if (action === 'list') {
      const [rows] = await connection.execute('SELECT * FROM notas WHERE visibilidad = "publico" ORDER BY created_at DESC');
      // Asegurarse de que lat y lng son números
      const data = rows.map(r => ({ ...r, lat: parseFloat(r.lat), lng: parseFloat(r.lng) }));
      return sendSuccess(data);

    } else if (action === 'stats') {
      const [rows] = await connection.execute(
        'SELECT DATE(created_at) as date, COUNT(*) as count FROM notas WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY DATE(created_at) ORDER BY date ASC'
      );
      return sendSuccess(rows);

    } else if (action === 'clear') {
      await connection.execute('DELETE FROM notas');
      return sendSuccess({ status: 'ok' });

    } else if (action === 'get_by_code') {
      const code = req.query.code || req.body?.code;
      if (!code) {
        return sendError('Código no proporcionado');
      }
      const [rows] = await connection.execute('SELECT * FROM notas WHERE share_code = ? LIMIT 1', [code]);
      if (rows.length > 0) {
        const data = rows.map(r => ({ ...r, lat: parseFloat(r.lat), lng: parseFloat(r.lng) }));
        return sendSuccess(data);
      } else {
        return sendSuccess([]); 
      }

    } else {
      return sendError(`Invalid action: ${action}`);
    }
  } catch (err) {
    console.error("DATABASE QUERY ERROR:", err);
    return sendError('Database error', err);
  }
}
