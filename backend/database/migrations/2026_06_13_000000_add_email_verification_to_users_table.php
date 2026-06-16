<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $hasVerifiedAt = Schema::hasColumn('users', 'email_verified_at');
        $hasToken = Schema::hasColumn('users', 'email_verification_token');
        $hasExpiresAt = Schema::hasColumn('users', 'email_verification_expires_at');

        Schema::table('users', function (Blueprint $table) use ($hasVerifiedAt, $hasToken, $hasExpiresAt): void {
            if (! $hasVerifiedAt) {
                $table->timestamp('email_verified_at')->nullable()->after('email');
            }
            if (! $hasToken) {
                $table->string('email_verification_token', 64)->nullable()->after('email_verified_at');
            }
            if (! $hasExpiresAt) {
                $table->timestamp('email_verification_expires_at')->nullable()->after('email_verification_token');
            }
        });

        if (! $hasVerifiedAt) {
            DB::table('users')
                ->whereNotNull('email')
                ->whereNull('email_verified_at')
                ->update(['email_verified_at' => now()]);
        }
    }

    public function down(): void
    {
        //
    }
};
