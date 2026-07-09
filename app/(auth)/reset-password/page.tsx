"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

const schema = z.object({
  email: z.string().email("Enter a valid email."),
});

type FormValues = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    const supabase = createClient();
    // Through the PKCE callback: it exchanges the recovery code for a session,
    // then forwards to the update-password page to set the new one.
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
    });
    setIsSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("If that email exists, a reset link is on its way.");
    form.reset();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a reset link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        </Form>
        <p className="text-muted-foreground mt-4 text-sm">
          <Link
            href="/login"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            Back to log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
