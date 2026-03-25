<?php
$DB_HOST = 'localhost';
$DB_USER = 'root';
$DB_PASS = '';
$DB_NAME = 'geonotes_db';

echo "<h3>Prueba de Conexión GeoNotes (Carpeta htdocs)</h3>";

try {
    $pdo = new PDO(
        "mysql:host={$DB_HOST};dbname={$DB_NAME};charset=utf8mb4",
        $DB_USER,
        $DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    echo "<p style='color:green'>✅ ¡Conexión exitosa a la base de datos!</p>";
    
    $stmt = $pdo->query("SHOW TABLES LIKE 'notas'");
    if ($stmt->rowCount() > 0) {
        echo "<p style='color:green'>✅ La tabla 'notas' existe.</p>";
    } else {
        echo "<p style='color:red'>❌ La tabla 'notas' NO existe en '$DB_NAME'.</p>";
    }

} catch (PDOException $e) {
    echo "<p style='color:red'>❌ Error de conexión: " . $e->getMessage() . "</p>";
    echo "<p><b>Sugerencia:</b> Si persiste, intenta cambiar 'localhost' por '127.0.0.1' en api.php.</p>";
}
?>
