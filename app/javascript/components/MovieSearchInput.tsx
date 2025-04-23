import { h, Fragment } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { Movie } from '../types';

interface MovieSearchInputProps {
  selectedMovies: Movie[];
  setSelectedMovies: (movies: Movie[]) => void;
}

export const MovieSearchInput = ({ selectedMovies, setSelectedMovies }: MovieSearchInputProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeout = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null); // Ref for click outside detection

  // Debounced search
  useEffect(() => {
    if (query.length < 3) {
      setResults([]);
      setShowResults(false);
      return;
    }

    setIsLoading(true);
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    searchTimeout.current = window.setTimeout(async () => {
      try {
        const response = await fetch(`/movies/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Search failed');
        const data: Movie[] = await response.json();
        // Filter out already selected movies
        const newResults = data.filter(result =>
            !selectedMovies.some(selected => selected.tmdb_id === result.tmdb_id) // Assuming tmdb_id is unique
        );
        setResults(newResults);
        setShowResults(true);
      } catch (error) {
        console.error('Error searching movies:', error);
        setResults([]);
        setShowResults(false);
      } finally {
        setIsLoading(false);
      }
    }, 300); // 300ms debounce

    // Cleanup timeout on unmount or query change
    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, [query, selectedMovies]);

   // Click outside handler
   useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowResults(false); // Hide results when clicking outside
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef]);


  const handleSelectMovie = (movie: Movie) => {
    // Add movie and ensure year is extracted if needed
    const movieToAdd: Movie = {
        ...movie,
        year: movie.release_date ? new Date(movie.release_date).getFullYear() : 0 // Extract year
    };
    setSelectedMovies([...selectedMovies, movieToAdd]);
    setQuery(''); // Clear search input
    setResults([]);
    setShowResults(false);
  };

  const handleRemoveMovie = (movieToRemove: Movie) => {
    setSelectedMovies(selectedMovies.filter(movie => movie.tmdb_id !== movieToRemove.tmdb_id));
  };

  return (
    <div ref={wrapperRef}>
      <div className="input-group mb-2">
        <input
          type="text"
          className="form-control"
          placeholder="Search for movies or TV shows..."
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          onFocus={() => query.length >= 3 && setShowResults(true)} // Show results on focus if query is long enough
        />
        {isLoading && (
          <span className="input-group-text">
            <div className="spinner-border spinner-border-sm" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </span>
        )}
      </div>

      {showResults && results.length > 0 && (
        <ul className="list-group position-absolute w-100" style={{ zIndex: 1000, maxHeight: '200px', overflowY: 'auto' }}>
          {results.map(movie => (
            <button
              type="button"
              key={movie.tmdb_id} // Use a unique ID like tmdb_id
              className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
              onClick={() => handleSelectMovie(movie)}
            >
              {movie.title} {movie.release_date ? `(${new Date(movie.release_date).getFullYear()})` : ''}
              <small className="text-muted">{movie.media_type || 'Movie'}</small>
            </button>
          ))}
        </ul>
      )}
       {showResults && results.length === 0 && !isLoading && query.length >= 3 && (
           <div className="list-group position-absolute w-100" style={{ zIndex: 1000 }}>
               <span className="list-group-item">No results found.</span>
           </div>
       )}


      {/* Display selected movies */}
      {selectedMovies.length > 0 && (
        <div className="mt-3">
          <h6>Selected:</h6>
          <ul className="list-inline">
            {selectedMovies.map(movie => (
              <li key={movie.tmdb_id} className="list-inline-item mb-1">
                <span className="badge bg-secondary d-flex align-items-center">
                  {movie.title} ({movie.year})
                  <button
                    type="button"
                    className="btn-close btn-close-white ms-2"
                    aria-label="Remove"
                    style={{ fontSize: '0.6em' }}
                    onClick={() => handleRemoveMovie(movie)}
                  ></button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
