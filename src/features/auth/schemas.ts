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

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, 'Your name is required'),
    company_name: z.string().trim().min(1, 'Company name is required'),
    email: z.string().trim().email('Enter a valid email'),
    phone: z.string().trim().optional(),
    password: z.string().min(8, 'Use at least 8 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });
export type SignupValues = z.infer<typeof signupSchema>;

export const forgotSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
});
export type ForgotValues = z.infer<typeof forgotSchema>;
