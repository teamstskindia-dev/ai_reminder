-- Sign in with Apple (user-flow §02 "Sign up with Google, Apple or email"): Apple's stable user id.
alter table public.users add column apple_sub text;
create unique index users_apple_sub_key on public.users (apple_sub);
