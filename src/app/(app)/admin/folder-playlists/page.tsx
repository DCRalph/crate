import { redirect } from "next/navigation";

/** Folder playlists used to have a page of their own. They are set up on each library's page now. */
export default function FolderPlaylistsPage() {
  redirect("/admin/libraries");
}
