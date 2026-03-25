<?php
header('Content-Type: application/json');
$DB_HOST = trim(getenv('DB_HOST') ?: 'localhost');
$DB_USER = trim(getenv('DB_USER') ?: 'root');
$DB_PASS = trim(getenv('DB_PASS') ?: '');
$DB_NAME = trim(getenv('DB_NAME') ?: 'geonotes_db');
$DB_PORT = trim(getenv('DB_PORT') ?: '3306');

$response = [
    "status" => "testing",
    "php_version" => phpversion(),
    "env_vars" => [
        "DB_HOST_set" => !empty(getenv('DB_HOST')),
        "DB_HOST_val" => $DB_HOST,
        "DB_PORT_val" => $DB_PORT,
    ]
];

try {
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 5,
    ];
    if ($DB_HOST !== 'localhost') {
        $options[1014] = false; // PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT
        $options[1007] = true;  // PDO::MYSQL_ATTR_SSL_CA (true uses system default if paths fail)
    }

    $dsn = "mysql:host=$DB_HOST;port=$DB_PORT;dbname=$DB_NAME;charset=utf8mb4";
    $pdo = new PDO($dsn, $DB_USER, $DB_PASS, $options);
    
    $response["db_connection"] = "SUCCESS";
    $stmt = $pdo->query("SELECT 1");
    $response["db_query"] = $stmt ? "SUCCESS" : "FAIL";
    
} catch (Exception $e) {
    $response["db_connection"] = "FAILED";
    $response["error_message"] = $e->getMessage();
    $response["error_code"] = $e->getCode();
}

echo json_encode($response, JSON_PRETTY_PRINT);
