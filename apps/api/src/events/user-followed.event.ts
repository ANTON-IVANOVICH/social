export class UserFollowedEvent {
  static readonly EVENT = "user.followed";
  constructor(
    public readonly followerId: string,
    public readonly followingId: string,
  ) {}
}
