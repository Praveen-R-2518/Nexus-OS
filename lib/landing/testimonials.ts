/**
 * Real customer quotes only.
 *
 * `TestimonialSection` renders `null` while this array is empty, so the landing
 * page ships honest and complete without them. To turn the section on, add
 * entries below — no component change is needed.
 *
 * Do not add illustrative, composite or placeholder quotes here. A landing page
 * that invents customers is the one thing that cannot be undone later.
 */

export type Testimonial = {
  /** The quote, verbatim. */
  quote: string;
  /** Person's name, as they agreed to be credited. */
  name: string;
  /** Role and company, e.g. "Founder, Acme". */
  role: string;
  /** Optional square avatar in /public. Falls back to initials when absent. */
  avatar?: string;
};

// TODO: replace with real, permissioned quotes before launch.
export const TESTIMONIALS: Testimonial[] = [];
