export class UserUnfollowedEvent {
  static readonly EVENT = "user.unfollowed";
  constructor(public readonly followerId: string) {}
}
