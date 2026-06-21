<?php

namespace App\Services;

use App\Models\AudioFile;
use App\Models\AudioJob;
use App\Models\User;
use App\Models\UserApiConfig;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class AccountDeletionService
{
    public function markDeleted(User $user): void
    {
        DB::transaction(function () use ($user): void {
            AudioFile::query()
                ->where('user_id', $user->id)
                ->get()
                ->each(function (AudioFile $file): void {
                    Storage::disk($file->disk)->delete($file->path);
                });

            AudioFile::query()->where('user_id', $user->id)->delete();
            AudioJob::query()->where('user_id', $user->id)->delete();
            UserApiConfig::query()->where('user_id', $user->id)->delete();

            if (Schema::hasTable('sessions') && Schema::hasColumn('sessions', 'user_id')) {
                DB::table('sessions')->where('user_id', $user->id)->delete();
            }

            $user->forceFill([
                'status' => User::STATUS_DELETED,
                'remember_token' => null,
                'pending_email' => null,
                'email_verification_token' => null,
                'email_verification_expires_at' => null,
                'two_factor_enabled' => false,
                'two_factor_code_hash' => null,
                'two_factor_expires_at' => null,
            ])->save();
        });
    }
}
