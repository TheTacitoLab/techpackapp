"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
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
  updateCollection,
} from "@/app/(app)/dashboard/actions";
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
import { eligibleParents } from "@/lib/collection-hierarchy";
import type { Brand, Collection, Season } from "@/types";

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

// Radix Select items can't carry an empty value — sentinel for "top-level".
const NO_PARENT = "none";

const collectionSchema = z
  .object({
    name: z.string().min(1, "Enter a collection name."),
    brand_id: z.string().optional(),
    season_id: z.string().optional(),
    parent_id: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    // A sub-collection inherits its parent's brand; only top-level
    // collections pick their own.
    const isTopLevel = !values.parent_id || values.parent_id === NO_PARENT;
    if (isTopLevel && !values.brand_id) {
      ctx.addIssue({
        code: "custom",
        path: ["brand_id"],
        message: "Choose a brand.",
      });
    }
  });

export function CreateCollectionDialog({
  brands,
  seasons = [],
  collections = [],
  defaultParentId,
  trigger,
}: {
  brands: Brand[];
  seasons?: Season[];
  /** Workspace collections — only top-level ones are offered as parents. */
  collections?: Collection[];
  defaultParentId?: string;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof collectionSchema>>({
    resolver: zodResolver(collectionSchema),
    defaultValues: {
      name: "",
      brand_id: "",
      season_id: "",
      parent_id: defaultParentId ?? NO_PARENT,
    },
  });

  const topLevelCollections = eligibleParents(collections);
  const watchedParentId = useWatch({
    control: form.control,
    name: "parent_id",
  });
  const selectedParent =
    watchedParentId && watchedParentId !== NO_PARENT
      ? (topLevelCollections.find((c) => c.id === watchedParentId) ?? null)
      : null;
  const parentBrandName = selectedParent
    ? (brands.find((b) => b.id === selectedParent.brand_id)?.name ?? null)
    : null;

  function onSubmit(values: z.infer<typeof collectionSchema>) {
    startTransition(async () => {
      try {
        const isTopLevel =
          !values.parent_id || values.parent_id === NO_PARENT;
        const result = await createCollection({
          name: values.name,
          brand_id: isTopLevel ? values.brand_id : undefined,
          season_id: values.season_id || undefined,
          parent_id: isTopLevel ? undefined : values.parent_id,
        });
        if (result.error || !result.id) {
          toast.error(result.error ?? "Could not create collection.");
          return;
        }
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
            {topLevelCollections.length > 0 && (
              <FormField
                control={form.control}
                name="parent_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parent collection (optional)</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? NO_PARENT}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="None — top-level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_PARENT}>
                          None — top-level
                        </SelectItem>
                        {topLevelCollections.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {selectedParent ? (
              <p className="text-muted-foreground text-xs">
                Sub-collections inherit their parent&rsquo;s brand
                {parentBrandName ? ` (${parentBrandName})` : ""}.
              </p>
            ) : brands.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                Collections belong to a brand.{" "}
                <Link href="/settings" className="underline underline-offset-2">
                  Create your first brand in Settings
                </Link>{" "}
                to continue.
              </p>
            ) : (
              <FormField
                control={form.control}
                name="brand_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Brand</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
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
            )}
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

// ---- Edit Collection ---------------------------------------------------------

const editCollectionSchema = z.object({
  name: z.string().min(1, "Enter a collection name."),
  parent_id: z.string().min(1),
});

/**
 * Rename and/or move a collection: under a (top-level) parent, or promote it
 * back to top-level. A collection that has sub-collections can't be nested —
 * the picker is disabled with a hint rather than letting the server reject.
 */
export function EditCollectionDialog({
  collection,
  collections,
  brands,
  trigger,
}: {
  collection: Collection;
  /** All workspace collections (for parent options + child detection). */
  collections: Collection[];
  brands: Brand[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof editCollectionSchema>>({
    resolver: zodResolver(editCollectionSchema),
    defaultValues: {
      name: collection.name,
      parent_id: collection.parent_id ?? NO_PARENT,
    },
  });

  // Re-seed from the CURRENT row on every open — mount-time defaults go
  // stale after an external rename and would silently revert it on save.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      form.reset({
        name: collection.name,
        parent_id: collection.parent_id ?? NO_PARENT,
      });
    }
  }

  const hasChildren = collections.some((c) => c.parent_id === collection.id);
  const parentOptions = eligibleParents(collections, collection.id);
  const watchedParentId = useWatch({
    control: form.control,
    name: "parent_id",
  });
  const selectedParent =
    watchedParentId !== NO_PARENT
      ? (parentOptions.find((c) => c.id === watchedParentId) ?? null)
      : null;
  const parentBrandName = selectedParent
    ? (brands.find((b) => b.id === selectedParent.brand_id)?.name ?? null)
    : null;

  function onSubmit(values: z.infer<typeof editCollectionSchema>) {
    startTransition(async () => {
      try {
        const result = await updateCollection(collection.id, {
          name: values.name,
          parent_id: values.parent_id === NO_PARENT ? null : values.parent_id,
        });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Collection updated.");
        setOpen(false);
        router.refresh();
      } catch {
        toast.error("Could not update the collection.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon" className="size-6 shrink-0">
            <Pencil className="size-3.5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit collection</DialogTitle>
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
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="parent_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parent collection</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={hasChildren}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="None — top-level" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_PARENT}>
                        None — top-level
                      </SelectItem>
                      {parentOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {hasChildren ? (
                    <p className="text-muted-foreground text-xs">
                      This collection has sub-collections, so it stays
                      top-level. Move or delete them first to nest it.
                    </p>
                  ) : selectedParent ? (
                    <p className="text-muted-foreground text-xs">
                      Moving under a parent adopts its brand
                      {parentBrandName ? ` (${parentBrandName})` : ""}.
                    </p>
                  ) : null}
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
  redirectTo,
  trigger,
}: {
  id: string;
  name: string;
  /** Where to go after deleting (e.g. off the deleted collection's page). */
  redirectTo?: string;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      try {
        const result = await deleteCollection(id);
        if (result.error) {
          // e.g. "still has sub-collections — move or delete them first".
          toast.error(result.error);
          return;
        }
        toast.success("Collection deleted.");
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      } catch {
        toast.error("Could not delete collection.");
      }
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon" className="size-6 shrink-0">
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        )}
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
