<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('users', 'linuxdo_id') && DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE users MODIFY linuxdo_id VARCHAR(255) NULL');
        }

        if (Schema::hasColumn('users', 'password')) {
            return;
        }

        Schema::table('users', function (Blueprint $table): void {
            $table->string('password')->nullable()->after('email');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('users', 'password')) {
            return;
        }

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('password');
        });
    }
};
