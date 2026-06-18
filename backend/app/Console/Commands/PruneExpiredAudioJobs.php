<?php

namespace App\Console\Commands;

use App\Services\AudioRetentionService;
use Illuminate\Console\Command;

class PruneExpiredAudioJobs extends Command
{
    protected $signature = 'mimo:prune-audio-retention';

    protected $description = 'Delete expired MimoTTS audio jobs and files according to admin retention settings.';

    public function handle(AudioRetentionService $retention): int
    {
        $result = $retention->pruneExpired();

        if (! $result['enabled']) {
            $this->info('Audio retention is disabled.');

            return self::SUCCESS;
        }

        $this->info(sprintf(
            'Deleted %d jobs and %d files older than %s.',
            $result['deleted_jobs'],
            $result['deleted_files'],
            $result['cutoff']
        ));

        return self::SUCCESS;
    }
}
