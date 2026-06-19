<?php

namespace App\Jobs;

use App\Models\AudioJob;
use App\Services\AudioJobProcessor;

class ProcessAudioJob
{
    private int $audioJobId;

    public function __construct(int $audioJobId)
    {
        $this->audioJobId = $audioJobId;
    }

    public function handle(AudioJobProcessor $processor): void
    {
        $job = AudioJob::query()->find($this->audioJobId);

        if (! $job) {
            return;
        }

        $processor->process($job);
    }
}
