class Store < ApplicationRecord
  has_many :policy_snapshots, dependent: :destroy
  
  validates :domain, presence: true, uniqueness: true
  validates :platform, presence: true, inclusion: { in: %w[shopify other] }
  
  before_validation :normalize_domain
  
  private
  
  def normalize_domain
    self.domain = domain&.downcase&.strip
  end
end
