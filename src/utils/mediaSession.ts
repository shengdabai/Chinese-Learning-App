/** Own resources for one connection attempt, including resources that arrive after exit. */
export class MediaSessionResources {
    private disposed = false;
    private cleanups: (() => void | Promise<void>)[] = [];

    get active(): boolean {
        return !this.disposed;
    }

    addCleanup(cleanup: () => void | Promise<void>): void {
        if (this.disposed) {
            this.release(cleanup);
        } else {
            this.cleanups.push(cleanup);
        }
    }

    trackStream(stream: MediaStream): MediaStream {
        this.addCleanup(() => stream.getTracks().forEach(track => track.stop()));
        return stream;
    }

    trackSession<T extends { close(): void }>(pending: Promise<T>): Promise<T> {
        return pending.then(session => {
            this.addCleanup(() => session.close());
            return session;
        });
    }

    dispose(): void {
        if (this.disposed) return;
        // Mark inactive first: closing a socket can invoke its callbacks synchronously.
        this.disposed = true;
        const cleanups = this.cleanups.splice(0).reverse();
        cleanups.forEach(cleanup => this.release(cleanup));
    }

    private release(cleanup: () => void | Promise<void>): void {
        try {
            void Promise.resolve(cleanup()).catch(() => {});
        } catch {
            // An already-closed resource must not prevent remaining resources from closing.
        }
    }
}

/** Paused/unready cameras must never be read or serialized by the sending loop. */
export function captureVideoFrame(
    video: HTMLVideoElement | null,
    canvas: HTMLCanvasElement | null,
    enabled: boolean,
): string | null {
    if (!enabled || !video || !canvas || video.videoWidth < 2 || video.videoHeight < 2) return null;
    canvas.width = Math.floor(video.videoWidth * 0.5);
    canvas.height = Math.floor(video.videoHeight * 0.5);
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.6).split(',')[1] || null;
}
