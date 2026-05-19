require 'date'

module Jekyll
  class ArchiveHiddenPostsGenerator < Generator
    priority :highest
    safe true

    def generate(site)
      cutoff_value = site.config['archive_cutoff_date']
      return if cutoff_value.nil? || cutoff_value.to_s.strip.empty?

      cutoff_date = Date.parse(cutoff_value.to_s)
      site.posts.docs.each do |post|
        next unless post.data['date']
        if post.date.to_date < cutoff_date
          post.data['hidden'] = true
          post.data['archived'] = true
        end
      end
    end
  end
end
