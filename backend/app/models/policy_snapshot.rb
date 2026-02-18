class PolicySnapshot < ApplicationRecord
  belongs_to :store
  belongs_to :user
  has_many :feedbacks, dependent: :destroy
  
  validates :policy_url, presence: true, format: { with: URI::DEFAULT_PARSER.make_regexp(%w[http https]) }
  validates :policy_type, presence: true, inclusion: { in: %w[refund shipping privacy terms subscription] }
  validates :checksum, presence: true
  validates :checksum, uniqueness: { scope: :store_id }, on: :create
  
  before_validation :generate_checksum, if: -> { summary.present? && checksum.blank? }
  
  scope :latest, -> { order(extracted_at: :desc).limit(1) }
  scope :by_policy_type, ->(type) { type.present? ? where(policy_type: type) : all }
  
  private
  
  def generate_checksum
    self.checksum = Digest::SHA256.hexdigest(summary.to_json)
  end
end
