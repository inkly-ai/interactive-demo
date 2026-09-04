import { ImageSettingsDialog } from "@/components/demo-editor/image-settings";
import { VideoTrimDialog } from "@/components/demo-editor/video-settings";
import {
  type ImageContentStep,
  type MediaSettingsButtonProps,
  type VideoContentStep,
} from "@/components/demo-editor/media-settings-shared";

/**
 * Entry point for the per-step media settings button: a crop + alignment
 * dialog for image steps and a separate trim + alignment dialog for video
 * steps.
 */
export function MediaSettingsButton(props: MediaSettingsButtonProps) {
  if (props.step.background.type === "video") {
    return (
      <VideoTrimDialog
        {...(props as Omit<MediaSettingsButtonProps, "step"> & {
          step: VideoContentStep;
        })}
      />
    );
  }
  return (
    <ImageSettingsDialog
      {...(props as Omit<MediaSettingsButtonProps, "step"> & {
        step: ImageContentStep;
      })}
    />
  );
}
