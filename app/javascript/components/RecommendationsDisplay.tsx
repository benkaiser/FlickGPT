import { h, Fragment } from 'preact';
import { Movie } from '../types';
import { useState } from 'preact/hooks';

interface RecommendationsDisplayProps {
  movieMatches: (Movie | null)[];
  isGenerating: boolean;
}

export const RecommendationsDisplay = ({ movieMatches, isGenerating }: RecommendationsDisplayProps) => {
  // State to track which videos are being loaded and displayed
  const [loadingVideos, setLoadingVideos] = useState<{[key: string]: boolean}>({});
  const [videoIds, setVideoIds] = useState<{[key: string]: string}>({});

  // Handle YouTube trailer button click
  const handleLoadTrailer = async (item: Movie, index: number) => {
    const movieKey = `${item.title}-${item.year}-${index}`;

    // Set loading state for this movie
    setLoadingVideos(prev => ({...prev, [movieKey]: true}));

    try {
      // Call the im_feeling_lucky_youtube endpoint
      const response = await fetch(`/movies/im_feeling_lucky_youtube?title=${encodeURIComponent(item.title)}${item.year ? `&year=${item.year}` : ''}`);

      if (response.ok) {
        const data = await response.json();
        if (data.video_id) {
          // Store the video ID
          setVideoIds(prev => ({...prev, [movieKey]: data.video_id}));
        }
      }
    } catch (error) {
      console.error('Failed to fetch trailer:', error);
    } finally {
      setLoadingVideos(prev => ({...prev, [movieKey]: false}));
    }
  };

  // Handle hiding trailer
  const handleHideTrailer = (movieKey: string) => {
    setVideoIds(prev => {
      const newState = {...prev};
      delete newState[movieKey];
      return newState;
    });
  };

  // Only render if there are items to display or if it's currently generating
  if (movieMatches.length === 0 && !isGenerating) {
    return null;
  }

  return (
    <div className="list-group">
      {movieMatches.filter(item => !!item).map((item, index) => {
        // Determine if this item is fully matched or just the initial recommendation
        const recommendationReason = item?.reason; // Always get reason from original recommendations
        const movieKey = `${item.title}-${item.year}-${index}`;
        const isVideoLoading = loadingVideos[movieKey];
        const videoId = videoIds[movieKey];

        return (
          <div
            key={movieKey}
            className="list-group-item d-flex flex-column flex-md-row align-items-start align-items-md-center gap-3 gap-md-4"
            style={{ minHeight: '200px' }}
          >
            {/* Poster Area */}
            <div
              style={{
                width: '150px', // Slightly smaller poster
                height: '225px',
                flexShrink: 0,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                overflow: 'hidden',
                backgroundColor: '#f8f9fa',
                alignSelf: 'start' // Center poster vertically on small screens
              }}
              className={!item.poster_path ? 'placeholder' : ''} // Add placeholder class if no poster
            >
              {item.poster_path ? (
                <img
                  src={item.poster_path}
                  alt={`${item.title} poster`}
                  className="img-fluid"
                  style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'cover' }}
                  loading="lazy" // Lazy load images
                />
              ) : (
                // Keep the placeholder div for structure even without image
                 <div style={{ width: '100%', height: '100%' }}></div>
              )}
            </div>

            {/* Details Area */}
            <div style={{ flex: 1, alignSelf: 'stretch' }}>
              <h5 className="mb-1">
                {item.title || <span className="placeholder col-6"></span>}
                {item.year ? ` (${item.year})` : ''}
              </h5>
              {item.genres && item.genres.length > 0 && (
                <p className="mb-1">
                  <small className="text-muted">
                    {item.genres.join(', ')}
                  </small>
                </p>
              )}
               {item.description && (
                 <p className="mb-1 small d-none d-md-block">{item.description}</p> // Hide description on smaller screens if needed
               )}
              {recommendationReason && ( // Use reason from original recommendation
                <p className="mb-1 fst-italic">
                   "{recommendationReason}"
                </p>
              )}
              {/* YouTube and IMDb links */}
              <p className="mt-2 mb-0">
                {!videoId ? (
                  <button
                    className="btn btn-sm btn-outline-danger me-2"
                    onClick={() => handleLoadTrailer(item, index)}
                    disabled={isVideoLoading}
                  >
                    {isVideoLoading ? (
                      <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-youtube" viewBox="0 0 16 16">
  <path d="M8.051 1.999h.089c.822.003 4.987.033 6.11.335a2.01 2.01 0 0 1 1.415 1.42c.101.38.172.883.22 1.402l.01.104.022.26.008.104c.065.914.073 1.77.074 1.957v.075c-.001.194-.01 1.108-.082 2.06l-.008.105-.009.104c-.05.572-.124 1.14-.235 1.558a2.01 2.01 0 0 1-1.415 1.42c-1.16.312-5.569.334-6.18.335h-.142c-.309 0-1.587-.006-2.927-.052l-.17-.006-.087-.004-.171-.007-.171-.007c-1.11-.049-2.167-.128-2.654-.26a2.01 2.01 0 0 1-1.415-1.419c-.111-.417-.185-.986-.235-1.558L.09 9.82l-.008-.104A31 31 0 0 1 0 7.68v-.123c.002-.215.01-.958.064-1.778l.007-.103.003-.052.008-.104.022-.26.01-.104c.048-.519.119-1.023.22-1.402a2.01 2.01 0 0 1 1.415-1.42c.487-.13 1.544-.21 2.654-.26l.17-.007.172-.006.086-.003.171-.007A100 100 0 0 1 7.858 2zM6.4 5.209v4.818l4.157-2.408z"/>
</svg>
                    )}
                    {' '}Trailer
                  </button>
                ) : (
                  <button
                    className="btn btn-sm btn-outline-danger me-2"
                    onClick={() => handleHideTrailer(movieKey)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-youtube" viewBox="0 0 16 16">
  <path d="M8.051 1.999h.089c.822.003 4.987.033 6.11.335a2.01 2.01 0 0 1 1.415 1.42c.101.38.172.883.22 1.402l.01.104.022.26.008.104c.065.914.073 1.77.074 1.957v.075c-.001.194-.01 1.108-.082 2.06l-.008.105-.009.104c-.05.572-.124 1.14-.235 1.558a2.01 2.01 0 0 1-1.415 1.42c-1.16.312-5.569.334-6.18.335h-.142c-.309 0-1.587-.006-2.927-.052l-.17-.006-.087-.004-.171-.007-.171-.007c-1.11-.049-2.167-.128-2.654-.26a2.01 2.01 0 0 1-1.415-1.419c-.111-.417-.185-.986-.235-1.558L.09 9.82l-.008-.104A31 31 0 0 1 0 7.68v-.123c.002-.215.01-.958.064-1.778l.007-.103.003-.052.008-.104.022-.26.01-.104c.048-.519.119-1.023.22-1.402a2.01 2.01 0 0 1 1.415-1.42c.487-.13 1.544-.21 2.654-.26l.17-.007.172-.006.086-.003.171-.007A100 100 0 0 1 7.858 2zM6.4 5.209v4.818l4.157-2.408z"/>
</svg> Hide Trailer
                  </button>
                )}
                {item.imdb_link && (
                  <a href={item.imdb_link} target="_blank" rel="noopener noreferrer" className="me-2">
                    <img
                      src="/imdb.svg"
                      alt="IMDb"
                      style={{ width: '30px', height: 'auto', verticalAlign: 'middle' }}
                    />
                  </a>
                )}
              </p>

              {/* YouTube Video Player */}
              {videoId && (
                <div className="mt-3 ratio ratio-16x9">
                    <iframe
                    src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
                    title={`${item.title} trailer`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    ></iframe>
                </div>
              )}
            </div>
          </div>
        );
      })}
       {isGenerating && movieMatches.length > 0 && movieMatches.some(item => !item) && (
           // Show a final loading indicator if still generating more items
           <div className="list-group-item text-center p-3">
               <div className="spinner-border spinner-border-sm text-primary me-2" role="status">
                   <span className="visually-hidden">Loading...</span>
               </div>
               Loading more recommendations...
           </div>
       )}
    </div>
  );
};
