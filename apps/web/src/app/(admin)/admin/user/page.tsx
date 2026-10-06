"use client";

import { adminUserService } from "@/api";
import { getApiErrorMessage } from "@/api/core/error";
import type { AdminUserResponseDto } from "@/api/dto/user";
import { ManagementToolbar } from "@/component/common/ManagementToolbar";
import { PageHeader } from "@/component/common/PageHeader";
import { DataTable,type Column } from "@/component/data/DataTable";
import { ConfirmDialog } from "@/component/modal/ConfirmDialog";
import { OtpPromptDialog } from "@/component/modal/OtpPromptDialog";
import { Badge } from "@/component/ui/badge";
import { Button } from "@/component/ui/button";
import { useDebouncedValue } from "@/hook/use-debounced-value";
import { queryKey } from "@/lib/query-key";
import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import {
Ban,
RotateCcw,
Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type AdminUser = AdminUserResponseDto;

export default function AdminUserPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [deactivateTarget, setDeactivateTarget] = useState<AdminUser | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  const qc = useQueryClient();
  const debouncedSearch = useDebouncedValue(search.trim());

  const { data, isLoading } = useQuery({
    queryKey: [...queryKey.admin.user, debouncedSearch, status, page],
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const res = await adminUserService.list({
        page,
        limit: 25,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(status ? { status } : {}),
      });
      return res;
    },
  });

  const refreshUsers = () => {
    qc.invalidateQueries({ queryKey: queryKey.admin.user });
  };

  const reactivateMutation = useMutation({
    mutationFn: ({ id, otpCode }: { id: string; otpCode: string }) =>
      adminUserService.reactivate(id, otpCode),
    onSuccess: () => {
      toast.success("User account restored and reactivated");
      refreshUsers();
      setReactivateTarget(null);
    },
    onError: (e) =>
      toast.error(getApiErrorMessage(e, "Unable to reactivate user")),
  });

  const deactivateMutation = useMutation({
    mutationFn: ({
      id,
      otpCode,
      reason,
    }: {
      id: string;
      otpCode: string;
      reason: string;
    }) => adminUserService.deactivate(id, { reason }, otpCode),
    onSuccess: () => {
      toast.success("User account deactivated");
      refreshUsers();
      setDeactivateTarget(null);
    },
    onError: (e) =>
      toast.error(getApiErrorMessage(e, "Unable to deactivate user")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminUserService.delete(id),
    onSuccess: () => {
      toast.success("User permanently deleted from database");
      refreshUsers();
      setDeleteTarget(null);
    },
    onError: (e) =>
      toast.error(getApiErrorMessage(e, "Unable to delete user")),
  });

  const columns: Column<AdminUser>[] = [
    {
      key: "email",
      header: "User Identity",
      render: (r) => {
        const initials =
          (r.firstName?.[0] || r.email?.[0] || "U").toUpperCase() +
          (r.lastName?.[0] || "").toUpperCase();
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs font-semibold text-neutral-800 dark:text-neutral-200">
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-neutral-900 dark:text-white truncate">
                {r.email}
              </span>
              <span className="text-xs text-neutral-400">
                {r.firstName || r.lastName
                  ? `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim()
                  : "Unspecified Name"}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      key: "isActive",
      header: "Account State",
      render: (r) =>
        r.isActive ? (
          <Badge variant="success" className="text-xs font-semibold">
            Active
          </Badge>
        ) : (
          <Badge variant="destructive" className="text-xs font-semibold">
            Suspended
          </Badge>
        ),
    },
    {
      key: "createdAt",
      header: "Joined Date",
      render: (r) => (
        <span className="text-xs text-neutral-400">
          {new Date(r.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div className="flex items-center gap-1">
          {r.isActive ? (
            <Button
              variant="ghost"
              size="sm"
              title="Deactivate account (requires OTP)"
              className="h-8 w-8 p-0 rounded-lg text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30"
              onClick={() => setDeactivateTarget(r)}
            >
              <Ban className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              title="Reactivate account (requires OTP)"
              className="h-8 w-8 p-0 rounded-lg text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              onClick={() => setReactivateTarget(r)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            title="Permanently delete user"
            className="h-8 w-8 p-0 rounded-lg text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
            onClick={() => setDeleteTarget(r)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Accounts"
        description="Search customer and vendor directories, manage credentials, and audit privileges."
      />

      <ManagementToolbar
        value={search}
        onChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search account email or customer name..."
        filterValue={status}
        onFilterChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        filters={[
          { value: "ACTIVE", label: "Active Accounts" },
          { value: "INACTIVE", label: "Inactive Accounts" },
          { value: "BANNED", label: "Suspended" },
        ]}
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        emptyMessage="No user accounts matched your search criteria."
        pagination={
          data?.meta
            ? {
                page: data.meta.page ?? page,
                limit: data.meta.limit ?? 25,
                total: data.meta.total,
                totalPages: data.meta.totalPages,
                onPageChange: (newPage) => setPage(newPage),
              }
            : undefined
        }
      />

      {/* SECURE DEACTIVATE MODAL (WITH REASON + OTP) */}
      <OtpPromptDialog
        open={Boolean(deactivateTarget)}
        onOpenChange={(v) => !v && setDeactivateTarget(null)}
        title="Deactivate User Account"
        description={`Suspending "${deactivateTarget?.email}" requires administrative justification and your 2FA security key.`}
        requireReason={true}
        reasonLabel="Reason for account deactivation"
        reasonPlaceholder="e.g. Terms violation, requested self-exclusion, security review..."
        confirmText="Confirm Deactivation"
        isLoading={deactivateMutation.isPending}
        onSubmit={({ otpCode, reason }) => {
          if (deactivateTarget && reason) {
            deactivateMutation.mutate({
              id: deactivateTarget.id,
              otpCode,
              reason,
            });
          }
        }}
      />

      {/* SECURE REACTIVATE MODAL (WITH OTP) */}
      <OtpPromptDialog
        open={Boolean(reactivateTarget)}
        onOpenChange={(v) => !v && setReactivateTarget(null)}
        title="Restore User Account"
        description={`Reactivating "${reactivateTarget?.email}" requires your administrative 2FA security key to verify clearance.`}
        requireReason={false}
        confirmText="Confirm Reactivation"
        isLoading={reactivateMutation.isPending}
        onSubmit={({ otpCode }) => {
          if (reactivateTarget) {
            reactivateMutation.mutate({
              id: reactivateTarget.id,
              otpCode,
            });
          }
        }}
      />

      {/* CONFIRM DELETE DIALOG */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Permanently Delete User"
        description={
          <>
            Are you sure you want to permanently delete{" "}
            <strong>&quot;{deleteTarget?.email}&quot;</strong>? This will remove all personal records
            and cannot be undone.
          </>
        }
        confirmText="Delete Account"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
