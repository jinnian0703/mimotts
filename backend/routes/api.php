<?php

use App\Http\Controllers\AdminConfigController;
use App\Http\Controllers\AdminOverviewController;
use App\Http\Controllers\AccountController;
use App\Http\Controllers\AnnouncementController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BillingController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\InstallController;
use App\Http\Controllers\MimoController;
use App\Http\Controllers\QuotaController;
use App\Http\Controllers\UpdateController;
use App\Http\Controllers\UserConfigController;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/csrf-token', function (Request $request): JsonResponse {
    return response()->json([
        'token' => $request->session()->token(),
    ]);
});
Route::get('/health', [HealthController::class, 'show'])->middleware(['auth.api', 'admin']);
Route::get('/basic-info', [AdminOverviewController::class, 'basicInfo']);
Route::get('/audio-retention', [AdminOverviewController::class, 'audioRetention']);
Route::get('/site-icons/{filename}', [AdminOverviewController::class, 'siteIcon'])
    ->where('filename', '[A-Za-z0-9._-]+');
Route::get('/auth/linuxdo/redirect', [AuthController::class, 'redirect']);
Route::get('/auth/linuxdo/callback', [AuthController::class, 'callback']);
Route::middleware('throttle:10,1')->group(function (): void {
    Route::post('/auth/email/register', [AuthController::class, 'emailRegister']);
    Route::post('/auth/email/login', [AuthController::class, 'emailLogin']);
    Route::post('/auth/email/two-factor', [AuthController::class, 'emailTwoFactor']);
    Route::post('/auth/email/verify', [AuthController::class, 'emailVerify']);
});
Route::post('/auth/logout', [AuthController::class, 'logout'])->middleware('auth.api');
Route::get('/me', [AuthController::class, 'me'])->middleware('auth.api');
Route::get('/billing/notify', [BillingController::class, 'notify']);
Route::post('/billing/notify', [BillingController::class, 'notify']);

Route::middleware('auth.api')->group(function (): void {
    Route::get('/account/linuxdo/redirect', [AccountController::class, 'linuxDoRedirect']);
    Route::delete('/account/linuxdo', [AccountController::class, 'unlinkLinuxDo']);
    Route::put('/account/profile', [AccountController::class, 'updateProfile']);
    Route::put('/account/email', [AccountController::class, 'updateEmail']);
    Route::put('/account/password', [AccountController::class, 'updatePassword']);
    Route::post('/account/two-factor/challenge', [AccountController::class, 'twoFactorChallenge']);
    Route::put('/account/two-factor', [AccountController::class, 'updateTwoFactor']);
    Route::delete('/account', [AccountController::class, 'destroy']);

    Route::get('/user/api-config', [UserConfigController::class, 'show']);
    Route::put('/user/api-config', [UserConfigController::class, 'update']);
    Route::delete('/user/api-config', [UserConfigController::class, 'destroy']);

    Route::get('/dashboard', [AdminOverviewController::class, 'dashboard']);
    Route::post('/mimo/asr', [MimoController::class, 'asr']);
    Route::post('/mimo/tts', [MimoController::class, 'tts']);
    Route::post('/mimo/voice-design', [MimoController::class, 'voiceDesign']);
    Route::post('/mimo/voice-clone', [MimoController::class, 'voiceClone']);
    Route::get('/mimo/jobs', [MimoController::class, 'jobs']);
    Route::get('/mimo/jobs/{audioJob}', [MimoController::class, 'job']);
    Route::delete('/mimo/jobs/{audioJob}', [MimoController::class, 'destroy']);
    Route::get('/mimo/files/{audioFile}', [MimoController::class, 'file']);
    Route::get('/billing/config', [BillingController::class, 'show']);
    Route::post('/billing/checkout', [BillingController::class, 'checkout']);
    Route::get('/quota/summary', [QuotaController::class, 'summary']);
    Route::post('/quota/check-in', [QuotaController::class, 'checkIn']);
    Route::get('/announcements', [AnnouncementController::class, 'index']);
});

Route::middleware(['auth.api', 'admin'])->group(function (): void {
    Route::get('/admin/mimo-config', [AdminConfigController::class, 'show']);
    Route::put('/admin/mimo-config', [AdminConfigController::class, 'update']);
    Route::get('/admin/email-auth-config', [InstallController::class, 'emailAuthConfig']);
    Route::put('/admin/email-auth-config', [InstallController::class, 'updateEmailAuthConfig']);
    Route::post('/admin/email-auth-config/test', [InstallController::class, 'testEmailAuthConfig']);
    Route::get('/admin/billing-config', [BillingController::class, 'adminShow']);
    Route::put('/admin/billing-config', [BillingController::class, 'adminUpdate']);
    Route::get('/admin/basic-info', [AdminOverviewController::class, 'basicInfo']);
    Route::put('/admin/basic-info', [AdminOverviewController::class, 'updateBasicInfo']);
    Route::post('/admin/basic-icon', [AdminOverviewController::class, 'uploadBasicIcon']);
    Route::get('/admin/audio-retention', [AdminOverviewController::class, 'audioRetention']);
    Route::put('/admin/audio-retention', [AdminOverviewController::class, 'updateAudioRetention']);
    Route::get('/admin/users', [AdminOverviewController::class, 'users']);
    Route::put('/admin/users/{user}', [AdminOverviewController::class, 'updateUser']);
    Route::delete('/admin/users/{user}', [AdminOverviewController::class, 'removeDeletedUser']);
    Route::post('/admin/users/{user}/quota-adjustments', [AdminOverviewController::class, 'adjustQuota']);
    Route::post('/admin/users/bulk', [AdminOverviewController::class, 'bulkUsers']);
    Route::get('/admin/jobs', [AdminOverviewController::class, 'allJobs']);
    Route::post('/admin/jobs/bulk-delete', [MimoController::class, 'bulkDestroy']);
    Route::delete('/admin/jobs/{audioJob}', [MimoController::class, 'destroy']);
    Route::get('/admin/audits', [AdminOverviewController::class, 'audits']);
    Route::get('/admin/settings', [AdminOverviewController::class, 'settings']);
    Route::get('/admin/update/status', [UpdateController::class, 'status']);
    Route::post('/admin/update/upgrade', [UpdateController::class, 'upgrade']);
    Route::get('/admin/announcements', [AnnouncementController::class, 'adminIndex']);
    Route::post('/admin/announcements', [AnnouncementController::class, 'store']);
    Route::put('/admin/announcements/{announcement}', [AnnouncementController::class, 'update']);
    Route::delete('/admin/announcements/{announcement}', [AnnouncementController::class, 'destroy']);
});
