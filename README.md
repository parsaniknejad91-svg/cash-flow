# Cash Flow v1.1.1 UPDATE

این نسخه با Endpoint واقعی Edge Function پروژه هماهنگ شده است.

Edge Function slug:
clever-processor

مراحل:
1. فایل Cash_Flow_v1.1.0_MIGRATION.sql را در Supabase SQL Editor اجرا کنید.
2. Edge Function فعلی با slug `clever-processor` را نگه دارید.
3. محتوای CREATE_USER_EDGE_FUNCTION.ts را داخل فایل index.ts قرار دهید و Deploy کنید.
4. در Settings گزینه Verify JWT with legacy secret را خاموش کنید و Save changes بزنید.
5. فایل‌های داخل پوشه github را روی GitHub جایگزین کنید.

اطلاعات قبلی حذف نمی‌شوند.
