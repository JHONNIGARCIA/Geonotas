<?php
echo json_encode([
    "status" => "ok",
    "message" => "PHP is working on Vercel!",
    "php_version" => phpversion(),
    "extensions" => get_loaded_extensions()
]);
