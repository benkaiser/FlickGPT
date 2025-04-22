import { h, render, Fragment } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { events } from 'fetch-event-stream';
import { parse } from 'best-effort-json-parser';
import * as Papa from 'papaparse';

interface Movie {
  title: string;
  year: number;
  genres?: string[];
  description?: string;
  reason?: string;
  poster_path?: string;
  imdb_link?: string;
}

interface Rating {
  imdb_id: string;
  user_rating: number;
  date_rated: string;
  title: string;
  year: number;
  genres: string;
  // Other fields omitted for brevity
}

const App = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [recommendations, setRecommendations] = useState<Movie[]>([]);
  const [movieMatches, setMovieMatches] = useState<(Movie | null)[]>([]); // New state for movie matches
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      setFile(target.files[0]);
    }
  };

  const processFile = async (): Promise<{ topRatings: Rating[], allTitles: string[] }> => {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject('No file selected');
        return;
      }

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors && results.errors.length > 0) {
            reject(`CSV parsing error: ${results.errors[0].message}`);
            return;
          }

          try {
            // Process all ratings for exclusion list
            const allRatings: Rating[] = results.data
              .filter(row => row['Const'] && row['Your Rating'])
              .map(row => ({
                imdb_id: row['Const'],
                user_rating: parseInt(row['Your Rating'], 10),
                date_rated: row['Date Rated'],
                title: row['Title']?.replace(/"/g, ''),
                year: parseInt(row['Year'], 10),
                genres: row['Genres'],
                original_title: row['Original Title']?.replace(/"/g, ''),
                url: row['URL'],
                title_type: row['Title Type'],
                imdb_rating: parseFloat(row['IMDb Rating']),
                runtime: parseInt(row['Runtime (mins)'], 10),
                num_votes: parseInt(row['Num Votes'], 10),
                release_date: row['Release Date'],
                directors: row['Directors']
              }));

            // Create a list of all movie titles with years for exclusion
            const allTitles = allRatings
              .map(rating => `${rating.title} (${rating.year})`)
              .slice(0, 1000); // Limit to 1000 titles to keep prompt size reasonable

            // Get top rated movies for recommendation basis
            const topRatings = [...allRatings]
              .sort((a, b) => {
                // Sort by user rating (descending) and then by date rated (descending)
                if (b.user_rating !== a.user_rating) {
                  return b.user_rating - a.user_rating;
                }
                return new Date(b.date_rated).getTime() - new Date(a.date_rated).getTime();
              })
              .slice(0, 100); // Take only the top 100 rated movies for analysis

            resolve({ topRatings, allTitles });
          } catch (err) {
            reject(err instanceof Error ? err.message : 'Error processing CSV data');
          }
        },
        error: (error) => {
          reject(`CSV parsing error: ${error.message}`);
        }
      });
    });
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const { topRatings, allTitles } = await processFile();
      setIsUploading(false);
      fetchRecommendations(topRatings, allTitles);
    } catch (err) {
      setIsUploading(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const fetchMovieDetails = async (movie: Movie, index: number): Promise<void> => {
    try {
      const response = await fetch('/movies/match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement).content
        },
        body: JSON.stringify({ title: movie.title, year: movie.year })
      });

      if (!response.ok) {
        console.error(`Failed to fetch movie details: ${response.status}`);
        return;
      }

      const matchedMovie = await response.json();
      setMovieMatches(prev => {
        const updated = [...prev];
        updated[index] = matchedMovie;
        return updated;
      });
    } catch (err) {
      console.error('Error fetching movie details:', err);
    }
  };

  const fetchRecommendations = async (ratings: Rating[], excludedTitles: string[]) => {
    setIsGenerating(true);
    setRecommendations([]);
    setMovieMatches([]); // Reset movie matches when fetching new recommendations
    setError(null);

    try {
      const response = await fetch('/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'X-CSRF-Token': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement).content
        },
        body: JSON.stringify({
          ratings,
          excluded_titles: excludedTitles
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      let stream = events(response);
      let completion = '';
      let currentIndex = -1;

      for await (let event of stream) {
        if (event.data === '[DONE]') {
          console.log('Stream complete');
          setIsGenerating(false);
          await fetchMovieDetails(recommendations[recommendations.length - 1], currentIndex);
          break;
        }

        try {
          const pieceOfData = JSON.parse(event.data);
          if (Array.isArray(pieceOfData)) {
            setRecommendations(pieceOfData);
          } else {
            const content = pieceOfData.choices[0]?.delta?.content || '';
            if (content) {
              completion += content;
              try {
                const parsedMovies = parse(completion) as Movie[];
                if (Array.isArray(parsedMovies)) {
                  setRecommendations(parsedMovies);

                  // Match the previous movie (if any)
                  if (currentIndex >= 0 && currentIndex < parsedMovies.length - 1) {
                    const previousMovie = parsedMovies[currentIndex];
                    await fetchMovieDetails(previousMovie, currentIndex);
                  }

                  currentIndex = parsedMovies.length - 1;
                }
              } catch (e) {
                console.error('Error parsing JSON:', e);
              }
            }
          }
        } catch (e) {
          console.error('Error parsing event data:', e);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsGenerating(false);
    }
  };

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-8">
          <div className="card">
            <div className="card-header bg-primary text-white">
              <h3 className="mb-0">Movie Recommendations</h3>
            </div>
            <div className="card-body">
              {!isGenerating && recommendations.length === 0 && (
                <div className="mb-4">
                  <h5>Upload your IMDb ratings export</h5>
                  <p className="text-muted">
                    We'll analyze your top-rated movies and recommend new ones you might like.
                  </p>

                  <div className="mb-3">
                    <input
                      type="file"
                      className="form-control"
                      accept=".csv"
                      onChange={handleFileChange}
                    />
                    <small className="text-muted">
                      Please upload a CSV file exported from IMDb.
                    </small>
                  </div>

                  <button
                    className="btn btn-primary"
                    disabled={!file || isUploading}
                    onClick={handleUpload}
                  >
                    {isUploading ? 'Uploading...' : 'Get Recommendations'}
                  </button>
                </div>
              )}

              {isGenerating && (
                <div className="d-flex justify-content-center my-4">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <p className="ms-3 mb-0">Generating recommendations...</p>
                </div>
              )}

              {error && (
                <div className="alert alert-danger" role="alert">
                  {error}
                </div>
              )}
              {movieMatches.filter(match => match !== null).length > 0 && (
                <div>
                  <h4 className="mb-3">Your Recommended Movies</h4>
                  <div className="list-group">
                    {movieMatches.map((matchedMovie, index) => {
                      if (!matchedMovie) return null; // Skip unmatched movies
                      const recommendation = recommendations[index];
                      return (
                        <div
                          key={`${matchedMovie.title}-${matchedMovie.year}-${index}`}
                          className="list-group-item d-flex align-items-center gap-4"
                          style={{ minHeight: '200px' }}
                        >
                          <div
                            style={{
                              width: '200px',
                              height: '300px',
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              overflow: 'hidden',
                              backgroundColor: '#f8f9fa'
                            }}
                          >
                            {matchedMovie.poster_path ? (
                              <img
                                src={matchedMovie.poster_path}
                                alt={`${matchedMovie.title} poster`}
                                className="img-fluid"
                                style={{ maxHeight: '100%', maxWidth: '100%' }}
                              />
                            ) : (
                              <div style={{ width: '100%', height: '100%' }}></div>
                            )}
                          </div>
                          <div style={{ flex: 1 }}>
                            <h5 className="mb-1">{matchedMovie.title} ({matchedMovie.year})</h5>
                            {matchedMovie.genres && (
                              <p className="mb-1">
                                <small className="text-muted">
                                  {matchedMovie.genres.join(', ')}
                                </small>
                              </p>
                            )}
                            {matchedMovie.description && (
                              <p className="mb-1">{matchedMovie.description}</p>
                            )}
                            {recommendation.reason && (
                              <p className="mb-1">
                                <strong>Why you might like it:</strong> {recommendation.reason}
                              </p>
                            )}
                            {matchedMovie.imdb_link && (
                              <p className="mt-2">
                                <a href={matchedMovie.imdb_link} target="_blank" rel="noopener noreferrer">
                                  <img
                                    src="/imdb.svg"
                                    alt="IMDb"
                                    style={{ width: '50px', height: 'auto' }}
                                  />
                                </a>
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const element = document.getElementById('app');
  if (element) {
    render(<App />, element);
  }
});