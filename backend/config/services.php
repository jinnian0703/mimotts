<?php

return [
    'linuxdo' => [
        'client_id' => env('LINUXDO_CLIENT_ID'),
        'client_secret' => env('LINUXDO_CLIENT_SECRET'),
        'redirect_uri' => env('LINUXDO_REDIRECT_URI', env('APP_URL').'/api/auth/linuxdo/callback'),
        'authorize_url' => 'https://connect.linux.do/oauth2/authorize',
        'token_url' => 'https://connect.linux.do/oauth2/token',
        'userinfo_url' => 'https://connect.linux.do/api/user',
        'scopes' => ['openid', 'profile', 'email'],
    ],
    'mimo' => [
        'base_url' => env('MIMO_BASE_URL', 'https://api.xiaomimimo.com/v1'),
        'api_key' => env('MIMO_API_KEY'),
        'timeout' => (int) env('MIMO_TIMEOUT', 120),
    ],
];
