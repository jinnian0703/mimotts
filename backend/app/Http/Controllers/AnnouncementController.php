<?php

namespace App\Http\Controllers;

use App\Models\Announcement;
use App\Services\AuditLogger;
use App\Support\DisplayTime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AnnouncementController
{
    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'announcements' => Announcement::query()
                ->visibleTo($request->user())
                ->published()
                ->orderByRaw('starts_at is null, starts_at desc')
                ->latest()
                ->limit(10)
                ->get()
                ->map(fn (Announcement $announcement) => $this->serializeAnnouncement($announcement))
                ->values(),
        ]);
    }

    public function adminIndex(): JsonResponse
    {
        return response()->json([
            'announcements' => Announcement::query()
                ->latest()
                ->get()
                ->map(fn (Announcement $announcement) => $this->serializeAnnouncement($announcement))
                ->values(),
        ]);
    }

    public function store(Request $request, AuditLogger $audit): JsonResponse
    {
        $announcement = Announcement::create(array_merge(
            $this->validated($request),
            [
                'created_by' => $request->user()->id,
                'updated_by' => $request->user()->id,
            ]
        ));

        $audit->record($request, 'announcement.create', 'announcement', $announcement->id);

        return response()->json([
            'announcement' => $this->serializeAnnouncement($announcement->fresh()),
        ], 201);
    }

    public function update(Request $request, Announcement $announcement, AuditLogger $audit): JsonResponse
    {
        $announcement->forceFill(array_merge(
            $this->validated($request),
            ['updated_by' => $request->user()->id]
        ))->save();

        $audit->record($request, 'announcement.update', 'announcement', $announcement->id);

        return response()->json([
            'announcement' => $this->serializeAnnouncement($announcement->fresh()),
        ]);
    }

    public function destroy(Request $request, Announcement $announcement, AuditLogger $audit): JsonResponse
    {
        $audit->record($request, 'announcement.delete', 'announcement', $announcement->id);
        $announcement->delete();

        return response()->json(['ok' => true]);
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:160'],
            'content' => ['required', 'string', 'max:5000'],
            'level' => ['required', Rule::in(['info', 'success', 'warning', 'destructive'])],
            'audience' => ['required', Rule::in(['all', 'admin', 'user'])],
            'active' => ['sometimes', 'boolean'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
        ]);

        if (array_key_exists('starts_at', $data)) {
            $data['starts_at'] = DisplayTime::storageFormat($data['starts_at']);
        }

        if (array_key_exists('ends_at', $data)) {
            $data['ends_at'] = DisplayTime::storageFormat($data['ends_at']);
        }

        return $data;
    }

    private function serializeAnnouncement(Announcement $announcement): array
    {
        return [
            'id' => (string) $announcement->id,
            'title' => $announcement->title,
            'content' => $announcement->content,
            'level' => $announcement->level,
            'audience' => $announcement->audience,
            'active' => (bool) $announcement->active,
            'startsAt' => DisplayTime::format($announcement->starts_at),
            'endsAt' => DisplayTime::format($announcement->ends_at),
            'createdAt' => DisplayTime::format($announcement->created_at),
            'updatedAt' => DisplayTime::format($announcement->updated_at),
        ];
    }
}
