"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import {
  createBrand,
  createCollection,
  createSeason,
  deleteBrand,
  deleteCollection,
  renameBrand,
} from "@/app/(app)/dashboard/actions";
import { useUiStore } from "@/stores/ui-store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Brand, Season } from "@/types";

// ---- Create Brand ------------------------------------------------------------

const brandSchema = z.object({ name: z.string().min(1, "Enter a brand name.") });

export function CreateBrandDialog({ trigger }: { trigger?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof brandSchema>>({
    resolver: zodResolver(brandSchema),
    defaultValues: { name: "" },
  });

  function onSubmit(values: z.infer<typeof brandSchema>) {
    startTransition(async () => {
      try {
        await createBrand(values);
        toast.success("Brand created.");
        setOpen(false);
        form.reset();
        router.refresh();
      } catch {
        toast.error("Could not create brand.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
            <Plus className="size-3.5" /> Add brand
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a brand</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brand name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Acme Athletics" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating…" : "Create brand"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Create Season -----------------------------------------------------------

const seasonSchema = z.object({
  name: z.string().min(1, "Enter a season name."),
  year: z.number().int().min(1900).max(2100),
});

type SeasonFormValues = { name: string; year: number };

export function CreateSeasonDialog({ trigger }: { trigger?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const form = useForm<SeasonFormValues>({
    resolver: zodResolver(seasonSchema) as import("react-hook-form").Resolver<SeasonFormValues>,
    defaultValues: { name: "", year: new Date().getFullYear() },
  });

  function onSubmit(values: SeasonFormValues) {
    startTransition(async () => {
      try {
        await createSeason(values);
        toast.success("Season created.");
        setOpen(false);
        form.reset();
        router.refresh();
      } catch {
        toast.error("Could not create season.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
            <Plus className="size-3.5" /> Add season
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a season</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Season name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Spring/Summer" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="year"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Year</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="2026"
                      {...field}
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating…" : "Create season"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Create Collection -------------------------------------------------------

const collectionSchema = z.object({
  name: z.string().min(1, "Enter a collection name."),
  brand_id: z.string().min(1, "Choose a brand."),
  season_id: z.string().optional(),
});

export function CreateCollectionDialog({
  brands,
  seasons,
  trigger,
}: {
  brands: Brand[];
  seasons: Season[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof collectionSchema>>({
    resolver: zodResolver(collectionSchema),
    defaultValues: { name: "", brand_id: "", season_id: "" },
  });

  function onSubmit(values: z.infer<typeof collectionSchema>) {
    startTransition(async () => {
      try {
        await createCollection({
          name: values.name,
          brand_id: values.brand_id,
          season_id: values.season_id || undefined,
        });
        toast.success("Collection created.");
        setOpen(false);
        form.reset();
        router.refresh();
      } catch {
        toast.error("Could not create collection.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
            <Plus className="size-3.5" /> Add collection
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a collection</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Collection name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Core Range SS26" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="brand_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brand</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a brand" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {brands.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {seasons.length > 0 && (
              <FormField
                control={form.control}
                name="season_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Season (optional)</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="No season" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {seasons.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} {s.year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating…" : "Create collection"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Delete Brand confirm ----------------------------------------------------

export function DeleteBrandButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      try {
        await deleteBrand(id);
        toast.success("Brand deleted.");
        router.refresh();
      } catch {
        toast.error("Could not delete brand.");
      }
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-6 shrink-0">
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            Products in this brand will become unassigned. Collections belonging
            to this brand will also be deleted. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---- Delete Collection confirm -----------------------------------------------

export function DeleteCollectionButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      try {
        await deleteCollection(id);
        toast.success("Collection deleted.");
        router.refresh();
      } catch {
        toast.error("Could not delete collection.");
      }
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-6 shrink-0">
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            Products in this collection will become unassigned. This cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---- Rename Brand dialog -----------------------------------------------------

export function RenameBrandDialog({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof brandSchema>>({
    resolver: zodResolver(brandSchema),
    defaultValues: { name },
  });

  function onSubmit(values: z.infer<typeof brandSchema>) {
    startTransition(async () => {
      try {
        await renameBrand(id, values.name);
        toast.success("Brand renamed.");
        setOpen(false);
        router.refresh();
      } catch {
        toast.error("Could not rename brand.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-6 shrink-0">
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename brand</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brand name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Create Collection (simple — uses activeBrandId from Zustand) ------------

const collectionSimpleSchema = z.object({
  name: z.string().min(1, "Enter a collection name."),
  season_id: z.string().optional(),
});

export function CreateCollectionDialogSimple({
  seasons = [],
  trigger,
}: {
  seasons?: Season[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const activeBrandId = useUiStore((s) => s.activeBrandId);

  const form = useForm<z.infer<typeof collectionSimpleSchema>>({
    resolver: zodResolver(collectionSimpleSchema),
    defaultValues: { name: "", season_id: "" },
  });

  function onSubmit(values: z.infer<typeof collectionSimpleSchema>) {
    if (!activeBrandId) {
      toast.error("No active brand selected. Go to Settings to set one.");
      return;
    }
    startTransition(async () => {
      try {
        await createCollection({
          name: values.name,
          brand_id: activeBrandId,
          season_id: values.season_id || undefined,
        });
        toast.success("Collection created.");
        setOpen(false);
        form.reset();
        router.refresh();
      } catch {
        toast.error("Could not create collection.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Plus className="size-3.5" />
            New collection
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a collection</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Collection name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Core Range SS26" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {seasons.length > 0 && (
              <FormField
                control={form.control}
                name="season_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Season (optional)</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="No season" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {seasons.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} {s.year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating…" : "Create collection"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
