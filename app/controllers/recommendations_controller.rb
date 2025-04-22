require 'net/http'
require 'uri'
require 'json'

class RecommendationsController < ApplicationController
  include ActionController::Live

  def create
    response.headers['Content-Type'] = 'text/event-stream'
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['Connection'] = 'keep-alive'

    begin
      # Get the ratings and excluded titles data from the request parameters
      ratings_data = params[:ratings]
      excluded_titles = params[:excluded_titles] || []

      # Remove top rated movies from exclusion list to avoid duplication in the prompt
      top_rated_titles = ratings_data.map { |r| "#{r[:title]} (#{r[:year]})" }
      excluded_titles = excluded_titles.reject { |title| top_rated_titles.include?(title) }

      if ratings_data.blank?
        response.stream.write("data: #{JSON.generate({ error: 'No ratings data provided' })}\n\n")
        response.stream.write("data: [DONE]\n\n")
        return
      end

      # Format movies for LLM input - more concise format
      movie_list = ratings_data.map do |movie|
        "#{movie[:title]} (#{movie[:year]}) - #{movie[:user_rating]}/10"
      end

      prompt = generate_llm_prompt(movie_list, excluded_titles)
      # log the prompt for debugging
      Rails.logger.info("Generated Prompt: #{prompt}")

      # Stream response from DeepInfra
      uri = URI.parse("https://api.deepinfra.com/v1/openai/chat/completions")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true

      request = Net::HTTP::Post.new(uri.path)
      request["Content-Type"] = "application/json"
      request["Authorization"] = "Bearer #{ENV['DEEPINFRA_API_KEY'] || 'YOUR_API_KEY_HERE'}"

      request.body = JSON.generate({
        model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        stream: true,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })

      http.request(request) do |api_response|
        if api_response.code != "200"
          response.stream.write("data: #{JSON.generate({ error: 'API request failed', status: api_response.code })}\n\n")
          response.stream.write("data: [DONE]\n\n")
          return
        end

        api_response.read_body do |chunk|
          if chunk.strip.start_with?('data:')
            response.stream.write("#{chunk}\n")
          end
        end
      end

      response.stream.write("data: [DONE]\n\n")
    rescue IOError
      # Client disconnected
    rescue StandardError => e
      response.stream.write("data: #{JSON.generate({ error: e.message })}\n\n")
      response.stream.write("data: [DONE]\n\n")
    ensure
      response.stream.close
    end
  end

  private

  def generate_llm_prompt(movies, excluded_titles)
    excluded_section = if excluded_titles.present?
      <<~EXCLUDED
        Please DO NOT recommend any of the following movies that I've already seen:
        #{excluded_titles.join(', ')}
      EXCLUDED
    else
      ""
    end

    <<~PROMPT
      Based on the following list of my favorite rated movies, please recommend 5 movies that I might like.

      My favorite movies:
      #{movies.join("\n")}

      #{excluded_section}

      Please respond only in this exact JSON format and nothing else:
      ```
      [
        {
          "title": "Movie Title",
          "year": 2023,
          "reason": "Why I might enjoy it based on my preferences, never mention other movies here"
        },
        ...
      ]
      ```

      Make sure to recommend varied movies that match my taste profile. Focus on the genres, themes, and styles I seem to enjoy.
    PROMPT
  end
end
