<?php
// ═══════════════════════════════════════════════════════════════════════
//  GeoNotes PWA — API Backend (PHP + MySQL/MariaDB para XAMPP)
// ═══════════════════════════════════════════════════════════════════════

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Preflight CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Configuración de la base de datos ─────────────────────────────────
// ── Configuración de la base de datos (Entorno Cloud) ───────────────────
$DB_HOST = getenv('DB_HOST') ?: 'localhost';
$DB_USER = getenv('DB_USER') ?: 'root';
$DB_PASS = getenv('DB_PASS') ?: '';
$DB_NAME = getenv('DB_NAME') ?: 'geonotes_db';
$DB_PORT = getenv('DB_PORT') ?: '3306';

// ── Conexión ──────────────────────────────────────────────────────────
try {
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    // Si es TiDB Cloud o similar en producción, forzamos SSL
    if ($DB_HOST !== 'localhost') {
        $options[PDO::MYSQL_ATTR_SSL_CA] = true; 
        $options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = false;
    }

    $pdo = new PDO(
        "mysql:host={$DB_HOST};port={$DB_PORT};dbname={$DB_NAME};charset=utf8mb4",
        $DB_USER,
        $DB_PASS,
        $options
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error de conexión: ' . $e->getMessage(), 'host' => $DB_HOST]);
    exit;
}

// ── Auto-migrate: add categoria column if missing ─────────────────────
try {
    $cols = $pdo->query("SHOW COLUMNS FROM notas LIKE 'categoria'")->fetchAll();
    if (count($cols) === 0) {
        $pdo->exec("ALTER TABLE notas ADD COLUMN categoria VARCHAR(20) DEFAULT 'general'");
    }
} catch (Exception $e) { /* table might not exist yet */ }

// ── Auto-migrate: add nombre column if missing ───────────────────────
try {
    $cols = $pdo->query("SHOW COLUMNS FROM notas LIKE 'nombre'")->fetchAll();
    if (count($cols) === 0) {
        $pdo->exec("ALTER TABLE notas ADD COLUMN nombre VARCHAR(50) DEFAULT NULL AFTER id");
    }
} catch (Exception $e) { /* table might not exist yet */ }

// ── Auto-migrate: add visibilidad column if missing ──────────────────
try {
    $cols = $pdo->query("SHOW COLUMNS FROM notas LIKE 'visibilidad'")->fetchAll();
    if (count($cols) === 0) {
        $pdo->exec("ALTER TABLE notas ADD COLUMN visibilidad ENUM('publico', 'privado') DEFAULT 'publico'");
    }
} catch (Exception $e) { }

// ── Auto-migrate: add share_code column if missing ───────────────────
try {
    $cols = $pdo->query("SHOW COLUMNS FROM notas LIKE 'share_code'")->fetchAll();
    if (count($cols) === 0) {
        $pdo->exec("ALTER TABLE notas ADD COLUMN share_code VARCHAR(10) DEFAULT NULL");
        $pdo->exec("CREATE INDEX idx_share_code ON notas(share_code)");
    }
} catch (Exception $e) { }

// ── Router ────────────────────────────────────────────────────────────
$action = $_GET['action'] ?? '';

switch ($action) {

    // ── Listar todas las notas ────────────────────────────────────────
    case 'list':
        // Only return public notes by default
        $stmt = $pdo->query("SELECT * FROM notas WHERE visibilidad = 'publico' ORDER BY fecha DESC");
        $notas = $stmt->fetchAll();

        $result = array_map(function ($row) {
            return [
                'id'        => (int) $row['id'],
                'nombre'    => $row['nombre'] ?? null,
                'text'      => $row['texto'],
                'lat'       => $row['latitud'] !== null ? (float) $row['latitud'] : null,
                'lng'       => $row['longitud'] !== null ? (float) $row['longitud'] : null,
                'categoria' => $row['categoria'] ?? 'general',
                'visibilidad' => $row['visibilidad'] ?? 'publico',
                'share_code' => $row['share_code'] ?? null,
                'timestamp' => strtotime($row['fecha']) * 1000,
            ];
        }, $notas);

        echo json_encode($result);
        break;

    // ── Guardar una nota ──────────────────────────────────────────────
    case 'save':
        $input = json_decode(file_get_contents('php://input'), true);

        if (empty($input['text'])) {
            http_response_code(400);
            echo json_encode(['error' => 'El texto de la nota es obligatorio.']);
            exit;
        }

        if (empty($input['nombre'])) {
            http_response_code(400);
            echo json_encode(['error' => 'El nombre es obligatorio.']);
            exit;
        }

        $visibilidad = $input['visibilidad'] ?? 'publico';
        $share_code = null;
        if ($visibilidad === 'privado') {
            $share_code = 'GN-' . strtoupper(substr(md5(uniqid(mt_rand(), true)), 0, 6));
        }

        $stmt = $pdo->prepare(
            'INSERT INTO notas (nombre, texto, latitud, longitud, categoria, visibilidad, share_code) VALUES (:nombre, :texto, :lat, :lng, :cat, :vis, :code)'
        );
        $stmt->execute([
            ':nombre' => $input['nombre'] ?? null,
            ':texto'  => $input['text'],
            ':lat'    => $input['lat'] ?? null,
            ':lng'    => $input['lng'] ?? null,
            ':cat'    => $input['categoria'] ?? 'general',
            ':vis'    => $visibilidad,
            ':code'   => $share_code,
        ]);

        $id = (int) $pdo->lastInsertId();
        $stmt = $pdo->prepare('SELECT * FROM notas WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();

        echo json_encode([
            'id'        => (int) $row['id'],
            'nombre'    => $row['nombre'] ?? null,
            'text'      => $row['texto'],
            'lat'       => $row['latitud'] !== null ? (float) $row['latitud'] : null,
            'lng'       => $row['longitud'] !== null ? (float) $row['longitud'] : null,
            'categoria' => $row['categoria'] ?? 'general',
            'visibilidad' => $row['visibilidad'] ?? 'publico',
            'share_code' => $row['share_code'] ?? null,
            'timestamp' => strtotime($row['fecha']) * 1000,
        ]);
        break;

    // ── Actualizar una nota ───────────────────────────────────────────
    case 'update':
        $id = (int) ($_GET['id'] ?? 0);
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'ID inválido.']);
            exit;
        }

        $input = json_decode(file_get_contents('php://input'), true);
        $fields = [];
        $params = [':id' => $id];

        if (isset($input['text'])) {
            $fields[] = 'texto = :texto';
            $params[':texto'] = $input['text'];
        }
        if (isset($input['categoria'])) {
            $fields[] = 'categoria = :cat';
            $params[':cat'] = $input['categoria'];
        }

        if (empty($fields)) {
            http_response_code(400);
            echo json_encode(['error' => 'Nada que actualizar.']);
            exit;
        }

        $sql = 'UPDATE notas SET ' . implode(', ', $fields) . ' WHERE id = :id';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        echo json_encode(['success' => true, 'updated' => $id]);
        break;

    // ── Eliminar una nota ─────────────────────────────────────────────
    case 'delete':
        $id = (int) ($_GET['id'] ?? 0);
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'ID inválido.']);
            exit;
        }

        $stmt = $pdo->prepare('DELETE FROM notas WHERE id = :id');
        $stmt->execute([':id' => $id]);
        echo json_encode(['success' => true, 'deleted' => $id]);
        break;

    // ── Estadísticas por día ──────────────────────────────────────────
    case 'stats':
        $stmt = $pdo->query(
            "SELECT DATE(fecha) as dia, COUNT(*) as total FROM notas WHERE visibilidad = 'publico' GROUP BY DATE(fecha) ORDER BY dia DESC LIMIT 7"
        );
        echo json_encode($stmt->fetchAll());
        break;

    // ── Obtener una nota por su código compartido ─────────────────────
    case 'get_by_code':
        $code = $_GET['code'] ?? '';
        if (empty($code)) {
            http_response_code(400);
            echo json_encode(['error' => 'Código no proporcionado.']);
            exit;
        }

        $stmt = $pdo->prepare('SELECT * FROM notas WHERE share_code = :code LIMIT 1');
        $stmt->execute([':code' => $code]);
        $row = $stmt->fetch();

        if (!$row) {
            http_response_code(404);
            echo json_encode(['error' => 'Nota no encontrada o código inválido.']);
            exit;
        }

        echo json_encode([
            'id'        => (int) $row['id'],
            'nombre'    => $row['nombre'] ?? null,
            'text'      => $row['texto'],
            'lat'       => $row['latitud'] !== null ? (float) $row['latitud'] : null,
            'lng'       => $row['longitud'] !== null ? (float) $row['longitud'] : null,
            'categoria' => $row['categoria'] ?? 'general',
            'visibilidad' => $row['visibilidad'],
            'share_code' => $row['share_code'],
            'timestamp' => strtotime($row['fecha']) * 1000,
        ]);
        break;

    // ── Eliminar todas las notas ──────────────────────────────────────
    case 'clear':
        $pdo->exec('DELETE FROM notas');
        $pdo->exec('ALTER TABLE notas AUTO_INCREMENT = 1');
        echo json_encode(['success' => true]);
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Acción no válida. Usa: list, save, update, delete, stats, clear']);
        break;
}
