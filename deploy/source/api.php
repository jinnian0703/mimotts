<?php

use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

$backend = __DIR__.'/backend';
$maintenance = $backend.'/storage/framework/maintenance.php';
$autoload = $backend.'/vendor/autoload.php';

if (! is_file($autoload)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'error' => [
            'code' => 'DependencyMissing',
            'message' => '后端依赖文件缺失',
        ],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if (file_exists($maintenance)) {
    require $maintenance;
}

require $autoload;

$app = require_once $backend.'/bootstrap/app.php';
$kernel = $app->make(Kernel::class);

$route = isset($_GET['r']) ? (string) $_GET['r'] : '/install/status';
if ($route === '' || $route[0] !== '/') {
    $route = '/'.$route;
}

$routeQuery = [];
if (strpos($route, '?') !== false) {
    [$route, $routeQueryString] = explode('?', $route, 2);
    parse_str($routeQueryString, $routeQuery);
}

$query = $_GET;
unset($query['r']);
$_GET = array_merge($routeQuery, $query);
$_REQUEST = array_merge($_GET, $_POST);

$_SERVER['SCRIPT_NAME'] = '/api.php';
$_SERVER['PHP_SELF'] = '/api.php';
$_SERVER['REQUEST_URI'] = '/api'.$route.($_GET ? '?'.http_build_query($_GET) : '');

$response = tap($kernel->handle(
    $request = Request::capture()
))->send();

$kernel->terminate($request, $response);
