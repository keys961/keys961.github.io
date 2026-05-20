require 'date'

Jekyll::Hooks.register :posts, :post_init do |post|
  cutoff = post.site.config['archive_cutoff_date']
  next unless cutoff

  begin
    cutoff_date = Date.parse(cutoff.to_s)
  rescue ArgumentError
    next
  end

  archived = post.date.to_date < cutoff_date
  post.data['archived'] = archived
  post.data['hidden'] = archived
end
