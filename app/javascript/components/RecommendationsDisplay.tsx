import { h, Fragment } from 'preact';
import { Movie } from '../types';

interface RecommendationsDisplayProps {
  recommendations: Movie[]; // Original recommendations from LLM
  movieMatches: (Movie | null)[]; // Matched movie details (or null/original if match failed)
  isGenerating: boolean;
}

export const RecommendationsDisplay = ({ recommendations, movieMatches, isGenerating }: RecommendationsDisplayProps) => {

  // Use movieMatches as the primary source for display, fallback to recommendations if needed
  const displayItems = movieMatches.map((match, index) => match ?? recommendations[index]);


  // Only render if there are items to display or if it's currently generating
  if (displayItems.length === 0 && !isGenerating) {
    return null;
  }

  return (
    <div className="list-group">
      {displayItems.map((item, index) => {
        // Handle potential null items if matching is in progress or failed unexpectedly
        if (!item) {
           // Show a loading placeholder if generating and this item hasn't loaded
           if (isGenerating) {
               return (
                   <div key={`loading-${index}`} className="list-group-item d-flex align-items-center gap-4" style={{ minHeight: '200px', backgroundColor: '#f8f9fa' }}>
                       <div style={{ width: '200px', height: '300px', backgroundColor: '#e9ecef' }} className="placeholder"></div>
                       <div style={{ flex: 1 }} className="placeholder-glow">
                           <span className="placeholder col-6 mb-2"></span>
                           <span className="placeholder col-8"></span>
                           <span className="placeholder col-4"></span>
                           <span className="placeholder col-7 mt-2"></span>
                       </div>
                   </div>
               );
           }
           return null; // Don't render anything if not generating and item is null
        }

        // Determine if this item is fully matched or just the initial recommendation
        const isMatched = !!item.poster_path; // Use poster_path presence as an indicator of a successful match
        const recommendationReason = recommendations[index]?.reason; // Always get reason from original recommendations

        return (
          <div
            key={`${item.title}-${item.year}-${index}`} // Use index for stable key during loading
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
                alignSelf: 'center' // Center poster vertically on small screens
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
            <div style={{ flex: 1, alignSelf: 'stretch' }} className={!isMatched && isGenerating ? 'placeholder-glow' : ''}>
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
              {item.imdb_link && (
                <p className="mt-2 mb-0">
                  <a href={item.imdb_link} target="_blank" rel="noopener noreferrer">
                    <img
                      src="/imdb.svg"
                      alt="IMDb"
                      style={{ width: '30px', height: 'auto', verticalAlign: 'middle', marginRight: '5px' }}
                    />
                  </a>
                </p>
              )}
               {!isMatched && isGenerating && ( // Show placeholders for text if loading match
                   <Fragment>
                       <span className="placeholder col-8 d-block mb-1"></span>
                       <span className="placeholder col-4 d-block mb-1"></span>
                       <span className="placeholder col-7 d-block"></span>
                   </Fragment>
               )}
            </div>
          </div>
        );
      })}
       {isGenerating && displayItems.length > 0 && displayItems.some(item => !item) && (
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
