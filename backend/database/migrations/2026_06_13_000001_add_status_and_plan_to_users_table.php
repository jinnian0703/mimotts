<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $hasStatus = Schema::hasColumn('users', 'status');
        $hasPlanId = Schema::hasColumn('users', 'plan_id');

        Schema::table('users', function (Blueprint $table) use ($hasStatus, $hasPlanId): void {
            if (! $hasStatus) {
                $table->string('status', 32)->default('active')->index()->after('is_admin');
            }
            if (! $hasPlanId) {
                $table->string('plan_id', 64)->nullable()->index()->after('status');
            }
        });
    }

    public function down(): void
    {
        //
    }
};
