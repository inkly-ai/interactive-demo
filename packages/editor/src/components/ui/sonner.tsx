
import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
    return (
        <SonnerToaster
            theme="light"
            position="top-center"
            offset={20}
            gap={10}
            visibleToasts={4}
            richColors
            closeButton
            toastOptions={{
                classNames: {
                    toast: "demo-toast",
                    title: "demo-toast-title",
                    description: "demo-toast-description",
                    actionButton: "demo-toast-action",
                    cancelButton: "demo-toast-cancel",
                    closeButton: "demo-toast-close",
                    icon: "demo-toast-icon",
                    loader: "demo-toast-loader",
                },
            }}
            style={
                {
                    "--normal-bg": "var(--surface)",
                    "--normal-border": "var(--line)",
                    "--normal-text": "var(--ink-strong)",
                    "--success-bg": "#e6ede4",
                    "--success-border": "#bcd0c0",
                    "--success-text": "#4f6c52",
                    "--error-bg": "#f4dadd",
                    "--error-border": "#e6b8be",
                    "--error-text": "#8b2f3a",
                    "--warning-bg": "#f4dccf",
                    "--warning-border": "#e3c2ad",
                    "--warning-text": "var(--accent-ink)",
                    "--info-bg": "color-mix(in oklab, var(--accent) 14%, white)",
                    "--info-border":
                        "color-mix(in oklab, var(--accent) 32%, white)",
                    "--info-text": "var(--accent-ink)",
                } as React.CSSProperties
            }
            {...props}
        />
    );
}

export { Toaster };
