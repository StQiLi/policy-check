class User < ApplicationRecord
  has_many :policy_snapshots, dependent: :destroy
  has_many :feedbacks, dependent: :destroy
  
  validates :email, presence: true, uniqueness: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :auth_token, presence: true, uniqueness: true
  
  before_validation :generate_auth_token, on: :create
  
  private
  
  def generate_auth_token
    self.auth_token = SecureRandom.uuid
  end
end
