"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

const schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

type FormValues = z.infer<typeof schema>;

/**
 * Set a new password after following a recovery link. The reset email's
 * `redirectTo` routes through /auth/callback?next=/update-password, so by the
 * time the user lands here the PKCE exchange has already established an
 * authenticated (recovery) session — updateUser() is all that's left. The
 * route is deliberately NOT in the proxy's AUTH_ROUTES list: authenticated
 * sessions must reach it, and an unauthenticated direct visit falls through
 * to the standard redirect to /login.
 */
export default function UpdatePasswordPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      password: values.password,
    });
    setIsSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated.");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>
          Choose a new password for your GarSpec account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm new password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Updating…" : "Update password"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
