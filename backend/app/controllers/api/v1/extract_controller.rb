module Api
  module V1
    class ExtractController < ApplicationController
      skip_before_action :authenticate_user!, raise: false

      def create
        text = extract_params[:text].to_s
        domain = extract_params[:domain].to_s

        if text.strip.length < 50
          render json: {
            error: {
              code: 'INSUFFICIENT_TEXT',
              message: 'Policy text is too short to extract meaningful information'
            }
          }, status: :unprocessable_entity
          return
        end

        result = PolicyExtractor.new(text: text, domain: domain).call

        render json: {
          fields: result[:fields],
          confidence: result[:confidence],
          source: 'ai',
          model: ENV.fetch('OPENAI_MODEL', 'gpt-4o-mini')
        }, status: :ok
      end

      private

      def extract_params
        params.permit(:text, :domain)
      end
    end
  end
end
