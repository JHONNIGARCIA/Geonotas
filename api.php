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
$DB_HOST = 'sql208.infinityfree.com';
$DB_USER = 'if0_41376911';
$DB_PASS = 'v5wZTGAy0J';  // ← Pon aquí tu contraseña de la BD
$DB_NAME = 'if0_41376911_geonotes_db';


// ── Conexión ──────────────────────────────────────────────────────────
try {
    $pdo = new PDO(
        "mysql:host={$DB_HOST};dbname={$DB_NAME};charset=utf8mb4",
        $DB_USER,
        $DB_PASS,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error de conexión: ' . $e->getMessage()]);
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

// ── Router ────────────────────────────────────────────────────────────
$action = $_GET['action'] ?? '';

switch ($action) {

    // ── Listar todas las notas ────────────────────────────────────────
    case 'list':
        $stmt = $pdo->query('SELECT * FROM notas ORDER BY fecha DESC');
        $notas = $stmt->fetchAll();

        $result = array_map(function ($row) {
            return [
                'id'        => (int) $row['id'],
                'nombre'    => $row['nombre'] ?? null,
                'text'      => $row['texto'],
                'lat'       => $row['latitud'] !== null ? (float) $row['latitud'] : null,
                'lng'       => $row['longitud'] !== null ? (float) $row['longitud'] : null,
                'categoria' => $row['categoria'] ?? 'general',
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

        $stmt = $pdo->prepare(
            'INSERT INTO notas (nombre, texto, latitud, longitud, categoria) VALUES (:nombre, :texto, :lat, :lng, :cat)'
        );
        $stmt->execute([
            ':nombre' => $input['nombre'] ?? null,
            ':texto' => $input['text'],
            ':lat'   => $input['lat'] ?? null,
            ':lng'   => $input['lng'] ?? null,
            ':cat'   => $input['categoria'] ?? 'general',
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
            "SELECT DATE(fecha) as dia, COUNT(*) as total FROM notas GROUP BY DATE(fecha) ORDER BY dia DESC LIMIT 7"
        );
        echo json_encode($stmt->fetchAll());
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
