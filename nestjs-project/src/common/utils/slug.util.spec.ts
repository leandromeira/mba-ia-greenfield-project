import { generateSlug } from './slug.util';

describe('generateSlug', () => {
  it('should generate a 12-character URL-safe string by default', () => {
    const slug = generateSlug();
    expect(slug).toHaveLength(12);
    expect(slug).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('should generate unique slugs on consecutive calls', () => {
    const slug1 = generateSlug();
    const slug2 = generateSlug();
    expect(slug1).not.toEqual(slug2);
  });

  it('should support custom length if specified', () => {
    const slug = generateSlug(16);
    expect(slug).toHaveLength(16);
  });
});
