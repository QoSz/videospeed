interface NetflixSeekData {
  action: string;
  seekMs: number;
}

window.addEventListener(
  'message',
  (event: MessageEvent): void => {
    const data = event.data as NetflixSeekData | undefined;
    if (
      event.origin !== 'https://www.netflix.com' ||
      !data ||
      data.action !== 'videospeed-seek' ||
      !data.seekMs
    ) {
      return;
    }
    if (!window.netflix) {
      return;
    }
    const videoPlayer =
      window.netflix.appContext.state.playerApp.getAPI().videoPlayer;
    const playerSessionId = videoPlayer.getAllPlayerSessionIds()[0];
    if (!playerSessionId) {
      return;
    }
    const currentTime =
      videoPlayer.getCurrentTimeBySessionId(playerSessionId);
    videoPlayer
      .getVideoPlayerBySessionId(playerSessionId)
      .seek(currentTime + data.seekMs);
  },
  false
);
