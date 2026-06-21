<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('announcements') || Schema::hasColumn('announcements', 'show_popup')) {
            return;
        }

        Schema::table('announcements', function (Blueprint $table): void {
            $table->boolean('show_popup')->default(true)->index()->after('active');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('announcements') || ! Schema::hasColumn('announcements', 'show_popup')) {
            return;
        }

        Schema::table('announcements', function (Blueprint $table): void {
            $table->dropColumn('show_popup');
        });
    }
};
