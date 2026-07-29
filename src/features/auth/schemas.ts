import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Email or username is required'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const otpSchema = z.object({
  code: z.string().trim().min(4, 'Enter the 6-digit code').max(8),
});
export type OtpValues = z.infer<typeof otpSchema>;

export const forgotSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
});
export type ForgotValues = z.infer<typeof forgotSchema>;

// Step 2 of the code-based reset (web PasswordReset.tsx): the emailed code plus
// the new password. Email is carried in from step 1 as a route param, not typed
// again.
export const resetPasswordSchema = z
  .object({
    code: z.string().trim().length(6, 'Enter the 6-digit code'),
    password: z.string().min(8, 'Use at least 8 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
