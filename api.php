<?php
// ═══════════════════════════════════════════════════════════════════════
//  GeoNotes PWA — API Backend (PHP + MySQL/MariaDB para XAMPP)
// ═══════════════════════════════════════════════════════════════════════

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Preflight CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Configuración de la base de datos ─────────────────────────────────
$DB_HOST = 'sql208.infinityfree.com';
$DB_USER = 'if0_41376911';
$DB_PASS = 'v5wZTGAy0J';
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
    echo json_encode(['error' => 'Error de conexión a la base de datos: ' . $e->getMessage()]);
    exit;
}

// ── Router ────────────────────────────────────────────────────────────
$action = $_GET['action'] ?? '';

switch ($action) {

    // ── Listar todas las notas ────────────────────────────────────────
    case 'list':
        $stmt = $pdo->query('SELECT * FROM notas ORDER BY fecha DESC');
        $notas = $stmt->fetchAll();

        // Mapear a formato compatible con el frontend
        $result = array_map(function ($row) {
            return [
                'id'        => (int) $row['id'],
                'text'      => $row['texto'],
                'lat'       => $row['latitud'] !== null ? (float) $row['latitud'] : null,
                'lng'       => $row['longitud'] !== null ? (float) $row['longitud'] : null,
                'timestamp' => strtotime($row['fecha']) * 1000, // milliseconds for JS
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

        $stmt = $pdo->prepare(
            'INSERT INTO notas (texto, latitud, longitud) VALUES (:texto, :lat, :lng)'
        );
        $stmt->execute([
            ':texto' => $input['text'],
            ':lat'   => $input['lat'] ?? null,
            ':lng'   => $input['lng'] ?? null,
        ]);

        $id = (int) $pdo->lastInsertId();

        // Devolver la nota recién creada
        $stmt = $pdo->prepare('SELECT * FROM notas WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();

        echo json_encode([
            'id'        => (int) $row['id'],
            'text'      => $row['texto'],
            'lat'       => $row['latitud'] !== null ? (float) $row['latitud'] : null,
            'lng'       => $row['longitud'] !== null ? (float) $row['longitud'] : null,
            'timestamp' => strtotime($row['fecha']) * 1000,
        ]);
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

    // ── Eliminar todas las notas ──────────────────────────────────────
    case 'clear':
        $pdo->exec('DELETE FROM notas');
        $pdo->exec('ALTER TABLE notas AUTO_INCREMENT = 1');
        echo json_encode(['success' => true]);
        break;

    // ── Acción no válida ──────────────────────────────────────────────
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Acción no válida. Usa: list, save, delete, clear']);
        break;
}
