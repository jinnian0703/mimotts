<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'quota_balance')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->integer('quota_balance')->default(0)->after('plan_id');
            });
        }

        if (! Schema::hasTable('quota_ledger_entries')) {
            Schema::create('quota_ledger_entries', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->foreignId('audio_job_id')->nullable()->constrained('audio_jobs')->nullOnDelete();
                $table->string('type', 32)->index();
                $table->string('module', 40)->nullable()->index();
                $table->integer('amount');
                $table->integer('balance_after');
                $table->string('description')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();

                $table->index(['user_id', 'created_at']);
                $table->index(['user_id', 'type', 'created_at']);
            });
        }

        if (! Schema::hasTable('billing_orders')) {
            Schema::create('billing_orders', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('plan_id', 64)->index();
                $table->string('plan_name');
                $table->integer('quota');
                $table->decimal('amount', 12, 2);
                $table->string('out_trade_no', 80)->unique();
                $table->string('trade_no', 120)->nullable()->index();
                $table->string('status', 32)->default('pending')->index();
                $table->timestamp('paid_at')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        //
    }
};
