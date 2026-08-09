"use client";

import { Download } from "lucide-react";

import { connectorUrl, useApiBase } from "@/lib/connector";
import type { Job } from "@/lib/types";
import { AudioPlayer } from "./audio-player";
import { TextViewer } from "./text-viewer";

export function DoneBody({
  job,
  onOpenJob,
}: {
  job: Job;
  onOpenJob?: (jobId: string) => void;
}) {
  const base = useApiBase();
  // A source job id rendered as a button that opens the Files drawer filtered to that job.
  const jobLink = (id: string) =>
    onOpenJob ? (
      <button
        type="button"
        onClick={() => onOpenJob(id)}
        className="cursor-pointer font-mono text-[#0084ff] hover:underline"
        title={`Open files for job ${id}`}
      >
        #{id}
      </button>
    ) : (
      <span className="font-mono text-[#050505]">#{id}</span>
    );

  if (job.tool === "generate_voiceover") {
    return (
      <div className="space-y-2">
        <div className="text-[13px] text-[#050505]">Voiceover recorded</div>
        <AudioPlayer jobId={job.id} />
        <TextViewer jobId={job.id} kind="script" label="script" />
      </div>
    );
  }
  if (job.tool === "generate_transcript") {
    return (
      <div className="space-y-2">
        <div className="text-[13px] text-[#050505]">Aligned transcript ready</div>
        <AudioPlayer jobId={job.id} />
        <TextViewer jobId={job.id} kind="transcript" label="transcript" />
      </div>
    );
  }
  if (job.tool === "build_video") {
    const r = job.result ?? {};
    const imgs = (r.images as number) ?? "?";
    const dur = r.duration_s as number | undefined;
    const captions = (r.captions as number) ?? 0;
    const srcImages = r.source_images_job as string | undefined;
    const srcAudio = r.source_audio_job as string | undefined;
    const voice = r.voice as string | undefined;
    return (
      <div className="space-y-2 text-[13px] text-[#050505]">
        <div>
          OpenCut project ready · {imgs} shots{dur ? ` · ${Math.round(dur)}s` : ""}
        </div>
        {(srcImages || srcAudio) && (
          <div className="text-[12px] text-[#65676b]">
            Sources:{" "}
            {srcImages && <>images {jobLink(srcImages)}</>}
            {srcImages && srcAudio && " · "}
            {srcAudio && (
              <>
                voice{voice ? <span className="font-medium text-[#050505]"> {voice}</span> : ""}{" "}
                {jobLink(srcAudio)}
              </>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <a
            href={connectorUrl(`/jobs/${job.id}/project`, base)}
            download={`${job.id}.opencut.json`}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[#0084ff] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#0072db]"
          >
            <Download className="h-3.5 w-3.5" />
            OpenCut project
          </a>
          {captions > 0 && (
            <a
              href={connectorUrl(`/jobs/${job.id}/srt`, base)}
              download={`${job.id}.srt`}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#e4e6eb] px-3 py-1.5 text-[12px] font-medium text-[#050505] hover:bg-[#f0f2f5]"
            >
              <Download className="h-3.5 w-3.5" />
              Captions (.srt)
            </a>
          )}
        </div>
        <div className="text-[12px] text-[#65676b]">
          Import the <span className="font-medium">.opencut.json</span> into the OpenCut editor to
          preview, tweak, and export the final video.
        </div>
      </div>
    );
  }
  return <div className="text-[13px] text-[#050505]">Done</div>;
}
