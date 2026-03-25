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

  const host = process.env.DB_HOST ? process.env.DB_HOST.trim() : 'localhost';
  const user = process.env.DB_USER ? process.env.DB_USER.trim() : 'root';
  const pass = process.env.DB_PASS ? process.env.DB_PASS.trim() : '';
  const name = process.env.DB_NAME ? process.env.DB_NAME.trim() : 'geonotes_db';
  const port = parseInt(process.env.DB_PORT ? process.env.DB_PORT.trim() : '4000', 10);
  
  const dbConfig = {
    host,
    user,
    password: pass,
    database: name,
    port,
    ssl: { rejectUnauthorized: false }
  };

  let connection;
  try {
    if (host === 'localhost') {
       connection = await mysql.createConnection({ host, user, password: pass, database: name, port });
    } else {
       connection = await mysql.createConnection(dbConfig);
    }
  } catch (err) {
    console.error("CRITICAL DB CONNECTION ERROR:", err);
    return res.status(500).json({ status: 'error', message: 'Fallo de BD', debug: err.message });
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
    if (action === 'setup') {
      // Auto-crear la tabla en Aiven sin necesidad de usar un programa externo
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS notas (
          id INT AUTO_INCREMENT PRIMARY KEY,
          lat DECIMAL(10, 8) NOT NULL,
          lng DECIMAL(11, 8) NOT NULL,
          type ENUM('General', 'Trabajo', 'Personal', 'Escuela', 'Idea') NOT NULL,
          text TEXT NOT NULL,
          image LONGTEXT DEFAULT NULL,
          visibilidad ENUM('publico', 'privado') DEFAULT 'publico',
          share_code VARCHAR(10) DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      return sendSuccess({ status: 'ok', message: 'Tabla notas creada en Aiven correctamente' });
      
    } else if (action === 'save') {
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

      const [insertResult] = await connection.execute(
        'INSERT INTO notas (lat, lng, type, text, image, visibilidad, share_code) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          lat != null ? lat : 0, 
          lng != null ? lng : 0, 
          type || 'General', 
          text || '', 
          image || null, 
          finalVisibilidad || 'publico', 
          shareCode || null
        ]
      );

      const [newRows] = await connection.execute('SELECT * FROM notas WHERE id = ?', [insertResult.insertId]);
      if (newRows.length > 0) {
        const newNote = newRows[0];
        const formattedNote = { 
          ...newNote, 
          timestamp: newNote.created_at, 
          lat: parseFloat(newNote.lat), 
          lng: parseFloat(newNote.lng) 
        };
        return sendSuccess({ status: 'ok', ...formattedNote });
      }

      return sendSuccess({ status: 'ok', share_code: shareCode });

    } else if (action === 'list') {
      const [rows] = await connection.execute("SELECT * FROM notas WHERE visibilidad = 'publico' ORDER BY created_at DESC");
      const data = rows.map(r => ({ ...r, timestamp: r.created_at, lat: parseFloat(r.lat), lng: parseFloat(r.lng) }));
      return sendSuccess(data);

    } else if (action === 'stats') {
      const [rows] = await connection.execute(
        'SELECT DATE(created_at) as date, COUNT(*) as count FROM notas WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY DATE(created_at) ORDER BY date ASC'
      );
      return sendSuccess(rows);

    } else if (action === 'clear') {
      await connection.execute('DELETE FROM notas');
      return sendSuccess({ status: 'ok' });

    } else if (action === 'delete') {
      const id = req.query.id || req.body?.id;
      if (!id) return sendError('ID no proporcionado');
      await connection.execute('DELETE FROM notas WHERE id = ?', [id]);
      return sendSuccess({ status: 'ok' });

    } else if (action === 'update') {
      const id = req.query.id || req.body?.id;
      const dataSrc = req.method === 'POST' ? req.body : req.query;
      const { text } = dataSrc;
      if (!id || !text) return sendError('Datos incompletos para actualizar');
      await connection.execute('UPDATE notas SET text = ? WHERE id = ?', [text, id]);
      return sendSuccess({ status: 'ok' });

    } else if (action === 'get_by_code') {
      const code = req.query.code || req.body?.code;
      if (!code) {
        return sendError('Código no proporcionado');
      }
      const [rows] = await connection.execute('SELECT * FROM notas WHERE share_code = ? LIMIT 1', [code]);
      if (rows.length > 0) {
        const data = rows.map(r => ({ ...r, timestamp: r.created_at, lat: parseFloat(r.lat), lng: parseFloat(r.lng) }));
        // Devolver un solo objeto (data[0]) en lugar del arreglo entero
        return sendSuccess(data[0]); 
      } else {
        connection.end();
        return res.status(404).json({ status: 'error', message: 'Código no válido o nota inexistente' }); 
      }

    } else {
      return sendError(`Invalid action: ${action}`);
    }
  } catch (err) {
    console.error("DATABASE QUERY ERROR:", err);
    return sendError('Database error', err);
  }
}

