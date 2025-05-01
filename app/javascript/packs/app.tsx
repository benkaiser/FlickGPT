import { h, render, Fragment, Component } from 'preact';
// Remove useState, useEffect imports
import { events } from 'fetch-event-stream';
import { parse } from 'best-effort-json-parser';
import { InterestsInput, InterestType } from '../components/InterestsInput';
import { MoodSelector } from '../components/MoodSelector';
import { MediaTypeSelector } from '../components/MediaTypeSelector';
import { RecommendationsDisplay } from '../components/RecommendationsDisplay';
import { Movie, Rating } from '../types';

export { Movie, Rating };

// Define interface for App state
interface AppState {
  interestType: InterestType;
  ratingsFile: File | null;
  topRatings: Rating[];
  allTitles: string[];
  favoriteMovies: Movie[];
  selectedGenres: string[];
  selectedMood: string;
  selectedMediaType: 'movie' | 'tv' | 'both';
  isProcessingFile: boolean;
  isGenerating: boolean;
  recommendations: Movie[];
  movieMatches: (Movie | null)[];
  error: string | null;
}

// Convert App to a class component
class App extends Component<{}, AppState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      interestType: 'favorites',
      ratingsFile: null,
      topRatings: [],
      allTitles: [],
      favoriteMovies: [],
      selectedGenres: [],
      selectedMood: 'whatever',
      selectedMediaType: 'both',
      isProcessingFile: false,
      isGenerating: false,
      recommendations: [],
      movieMatches: [],
      error: null
    };
  }

  // Equivalent to useEffect for interestType changes
  componentDidUpdate(prevProps: {}, prevState: AppState) {
    if (prevState.interestType !== this.state.interestType) {
      this.setState({
        recommendations: [],
        movieMatches: [],
        error: null
      });
    }
  }

  fetchMovieDetails = async (movie: Movie, index: number): Promise<void> => {
    try {
      // Skip fetching if this movie is in our allTitles list (for IMDb ratings)
      if (this.state.interestType === 'imdb') {
        const movieTitle = `${movie.title} (${movie.year})`;
        if (this.state.allTitles.some(title => title.toLowerCase() === movieTitle.toLowerCase())) {
          console.log(`Skipping already seen movie: ${movieTitle}`);
          return;
        }
      }

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
      this.setState(prevState => {
        const updated = [...prevState.movieMatches];
        updated[index] = {
          ...matchedMovie,
          reason: prevState.recommendations[index]?.reason
        };
        return { movieMatches: updated };
      });
    } catch (err) {
      console.error('Error fetching movie details:', err);
      this.setState({
        error: err instanceof Error ? `Error fetching details: ${err.message}` : 'Unknown error fetching details'
      });
    }
  };

  generateRecommendations = async () => {
    this.setState({
      isGenerating: true,
      recommendations: [],
      movieMatches: [],
      error: null
    });

    const { interestType, selectedMood, selectedMediaType, topRatings, favoriteMovies, selectedGenres } = this.state;

    const payload: any = {
      interest_type: interestType,
      mood: selectedMood,
      media_type: selectedMediaType,
    };

    if (interestType === 'imdb') {
      payload.ratings = topRatings;
    } else if (interestType === 'favorites') {
      payload.favorite_movies = favoriteMovies.map(m => ({ title: m.title, year: m.year }));
    } else if (interestType === 'genres') {
      payload.genres = selectedGenres;
    }

    try {
      const response = await fetch('/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'X-CSRF-Token': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement).content
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      let stream = events(response);
      let completion = '';
      let currentIndex = 0;

      for await (let event of stream) {
        if (event.data === '[DONE]') {
          console.log('Stream complete');
          console.log(completion);
          console.log(this.state.recommendations);
          // Fetch the last matched movie details
          if (this.state.recommendations.length > 0) {
            await this.fetchMovieDetails(
              this.state.recommendations[this.state.recommendations.length - 1],
              this.state.recommendations.length - 1
            );
          }
          this.setState({ isGenerating: false });
          break;
        }

        try {
          const pieceOfData = JSON.parse(event.data);
          const content = pieceOfData.choices[0]?.delta?.content || '';
          if (content) {
            completion += content;
            try {
              const completionParsed = parse(completion);
              if (!completionParsed || !completionParsed.recommendations) {
                continue;
              }

              const parsedMovies = completionParsed.recommendations as Movie[];
              if (Array.isArray(parsedMovies) && parsedMovies.length > 0) {
                this.setState({ recommendations: parsedMovies });
                // After updating recommendations, fetch details for the previous movie
                if (currentIndex < parsedMovies.length - 1) {
                  const previousMovie = parsedMovies[currentIndex];
                  this.fetchMovieDetails(previousMovie, currentIndex);
                  currentIndex++;
                }
              }
            } catch (e) {
              // Ignore intermediate parsing errors
              // console.error('Error parsing JSON:', e);
            }
          }
        } catch (e) {
          console.error('Error processing stream event:', e, event.data);
        }
      }
    } catch (err) {
      this.setState({
        error: err instanceof Error ? err.message : String(err),
        isGenerating: false
      });
    }
  };

  render() {
    const {
      interestType, ratingsFile, topRatings, allTitles, favoriteMovies, selectedGenres,
      selectedMood, selectedMediaType, isProcessingFile, isGenerating,
      recommendations, movieMatches, error
    } = this.state;

    const canGenerate = !isGenerating && (
      (interestType === 'imdb' && topRatings.length > 0) ||
      (interestType === 'favorites' && favoriteMovies.length > 0) ||
      (interestType === 'genres' && selectedGenres.length > 0)
    );

    return (
      <div className="container mt-5">
        <div className="row justify-content-center">
          <div className="col-md-10 col-lg-8">
            <div className="card">
              <div className="card-header bg-primary text-white">
                <h3 className="mb-0">FlickGPT Recommendations</h3>
              </div>
              <div className="card-body">
                <p>
                  Get personalized movie and TV show recommendations based on your interests.
                  <br />
                  Choose your favorite movies, genres, or upload your IMDb ratings to get started!
                </p>
                <div className="mb-4">
                  <h4 className="mb-3">Your Interests</h4>
                  <InterestsInput
                    interestType={interestType}
                    setInterestType={(type) => this.setState({ interestType: type })}
                    ratingsFile={ratingsFile}
                    setRatingsFile={(file) => this.setState({ ratingsFile: file })}
                    topRatings={topRatings}
                    setTopRatings={(ratings) => this.setState({ topRatings: ratings })}
                    allTitles={allTitles}
                    setAllTitles={(titles) => this.setState({ allTitles: titles })}
                    favoriteMovies={favoriteMovies}
                    setFavoriteMovies={(movies) => this.setState({ favoriteMovies: movies })}
                    selectedGenres={selectedGenres}
                    setSelectedGenres={(genres) => this.setState({ selectedGenres: genres })}
                    isProcessingFile={isProcessingFile}
                    setIsProcessingFile={(processing) => this.setState({ isProcessingFile: processing })}
                    error={error}
                    setError={(err) => this.setState({ error: err })}
                  />
                </div>

                <div className="mb-4">
                  <h4 className="mb-3">What You're Looking For</h4>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <MoodSelector
                        selectedMood={selectedMood}
                        setSelectedMood={(mood) => this.setState({ selectedMood: mood })}
                      />
                    </div>
                    <div className="col-md-6">
                      <MediaTypeSelector
                        selectedMediaType={selectedMediaType}
                        setSelectedMediaType={(type) => this.setState({ selectedMediaType: type })}
                      />
                    </div>
                  </div>
                </div>

                <div className="d-grid gap-2 mb-4">
                  <button
                    className="btn btn-primary btn-lg"
                    disabled={!canGenerate || isGenerating}
                    onClick={this.generateRecommendations}
                  >
                    {isGenerating ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Generating...
                      </>
                    ) : (
                      'Get Recommendations'
                    )}
                  </button>
                </div>

                {error && (
                  <div className="alert alert-danger" role="alert">
                    {error}
                  </div>
                )}

                {(isGenerating || movieMatches.length > 0 || recommendations.length > 0) && (
                  <div className="mt-4">
                    <h4 className="mb-3">FlickGPT Recommendations</h4>
                    {isGenerating && movieMatches.length === 0 && (
                      <div className="d-flex justify-content-center my-4">
                        <div className="spinner-border text-primary" role="status">
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        <p className="ms-3 mb-0">Generating recommendations...</p>
                      </div>
                    )}
                    <RecommendationsDisplay
                      movieMatches={movieMatches}
                      isGenerating={isGenerating}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const element = document.getElementById('app');
  if (element) {
    render(<App />, element);
  }
});