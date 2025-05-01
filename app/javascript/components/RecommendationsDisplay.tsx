import { h, Fragment } from 'preact';
import { Movie } from '../types';

interface RecommendationsDisplayProps {
  movieMatches: (Movie | null)[];
  isGenerating: boolean;
}

export const RecommendationsDisplay = ({ movieMatches, isGenerating }: RecommendationsDisplayProps) => {
  // Only render if there are items to display or if it's currently generating
  if (movieMatches.length === 0 && !isGenerating) {
    return null;
  }

  return (
    <div className="list-group">
      {movieMatches.filter(item => !!item).map((item, index) => {
        // Determine if this item is fully matched or just the initial recommendation
        const recommendationReason = item?.reason; // Always get reason from original recommendations

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
